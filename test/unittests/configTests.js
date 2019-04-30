/*
 * Copyright 2018. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

const constants = require('../../src/nodejs/constants.js');

/* eslint-disable global-require */

function MockRestOperation(opts) {
    this.method = opts.method || 'GET';
    this.body = opts.body;
    this.statusCode = null;
}
MockRestOperation.prototype.getMethod = function () { return this.method; };
MockRestOperation.prototype.setMethod = function (method) { this.method = method; };
MockRestOperation.prototype.getBody = function () { return this.body; };
MockRestOperation.prototype.setBody = function (body) { this.body = body; };
MockRestOperation.prototype.getStatusCode = function () { return this.statusCode; };
MockRestOperation.prototype.setStatusCode = function (code) { this.statusCode = code; };
MockRestOperation.prototype.complete = function () { };


describe('Config', () => {
    let persistentStorage;
    let config;
    let util;
    let deviceUtil;

    let configValidator;
    let formatConfig;

    const baseState = {
        _data_: {
            config: {
                raw: {},
                parsed: {}
            }
        }
    };

    before(() => {
        const psModule = require('../../src/nodejs/persistentStorage.js');
        config = require('../../src/nodejs/config.js');
        util = require('../../src/nodejs/util.js');
        deviceUtil = require('../../src/nodejs/deviceUtil.js');

        const restWorker = {
            loadState: (cb) => { cb(null, baseState); },
            saveState: (first, state, cb) => { cb(null); }
        };
        persistentStorage = psModule.persistentStorage;
        persistentStorage.storage = new psModule.RestStorage(restWorker);

        configValidator = config.validator;

        formatConfig = util.formatConfig;
    });
    beforeEach(() => {
        persistentStorage.storage._cache = JSON.parse(JSON.stringify(baseState));
    });
    afterEach(() => {
        config.validator = configValidator;
        util.formatConfig = formatConfig;
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should validate basic declaration', () => {
        const obj = {
            class: 'Telemetry'
        };
        return config.validate(obj);
    });

    it('should throw error in validate function', () => {
        const obj = {
            class: 'Telemetry'
        };
        config.validator = null;
        return config.validate(obj)
            .then(() => {
                assert.fail('Should throw an error');
            })
            .catch((err) => {
                if (err.code === 'ERR_ASSERTION') return Promise.reject(err);
                if (/Validator is not available/.test(err)) return Promise.resolve();

                assert.fail(err);
                return Promise.reject(err);
            });
    });

    it('should compile schema', () => {
        const compiledSchema = config.compileSchema;
        assert.strictEqual(typeof compiledSchema, 'function');
    });

    it('should validate and apply basic declaration', () => {
        const obj = {
            class: 'Telemetry'
        };
        const validatedObj = {
            class: 'Telemetry',
            schemaVersion: constants.VERSION
        };
        return config.validateAndApply(obj)
            .then((data) => {
                assert.deepEqual(data, validatedObj);
                return Promise.resolve();
            })
            .catch(err => Promise.reject(err));
    });

    it('should load state', () => {
        deviceUtil.decryptAllSecrets = () => Promise.resolve({});

        return config.loadConfig()
            .then((data) => {
                assert.deepEqual(data, baseState._data_.config);
            })
            .catch(err => Promise.reject(err));
    });

    it('should process client POST request', () => {
        const mockRestOperation = new MockRestOperation({ method: 'POST' });
        mockRestOperation.setBody({
            class: 'Telemetry'
        });

        const actualResponseBody = {
            message: 'success',
            declaration: {
                class: 'Telemetry',
                schemaVersion: constants.VERSION
            }
        };
        return config.processClientRequest(mockRestOperation)
            .then(() => {
                assert.strictEqual(mockRestOperation.statusCode, 200);
                assert.deepEqual(mockRestOperation.body, actualResponseBody);
                return Promise.resolve();
            })
            .catch(err => Promise.reject(err));
    });

    it('should process client GET request - no configuration', () => {
        const actualResponseBody = {
            message: 'success',
            declaration: {}
        };

        const mockRestOperation = new MockRestOperation({ method: 'GET' });
        mockRestOperation.setBody({});

        return config.processClientRequest(mockRestOperation)
            .then(() => {
                assert.strictEqual(mockRestOperation.statusCode, 200);
                assert.deepEqual(mockRestOperation.body, actualResponseBody);
                return Promise.resolve();
            })
            .catch(err => Promise.reject(err));
    });

    it('should process client GET request - existing config', () => {
        const mockRestOperationPOST = new MockRestOperation({ method: 'POST' });
        mockRestOperationPOST.setBody({
            class: 'Telemetry'
        });

        const mockRestOperationGET = new MockRestOperation({ method: 'GET' });
        mockRestOperationGET.setBody({});

        return config.processClientRequest(mockRestOperationPOST)
            .then(() => {
                assert.strictEqual(mockRestOperationPOST.statusCode, 200);
                return config.processClientRequest(mockRestOperationGET);
            })
            .then(() => {
                assert.strictEqual(mockRestOperationGET.statusCode, 200);
                assert.deepEqual(mockRestOperationGET.body, mockRestOperationPOST.body);
                return Promise.resolve();
            })
            .catch(err => Promise.reject(err));
    });

    it('should fail to validate client request', () => {
        const mockRestOperation = new MockRestOperation({ method: 'POST' });
        mockRestOperation.setBody({
            class: 'foo'
        });
        return config.processClientRequest(mockRestOperation)
            .then(() => {
                assert.strictEqual(mockRestOperation.statusCode, 422);
                assert.strictEqual(mockRestOperation.body.message, 'Unprocessable entity');
                return Promise.resolve();
            })
            .catch(err => Promise.reject(err));
    });

    it('should fail to process client request', () => {
        const mockRestOperation = new MockRestOperation({ method: 'POST' });
        mockRestOperation.setBody({
            class: 'Telemetry'
        });

        util.formatConfig = () => { throw new Error('foo'); };

        return config.processClientRequest(mockRestOperation)
            .then(() => {
                assert.strictEqual(mockRestOperation.statusCode, 500);
                assert.strictEqual(mockRestOperation.body.message, 'Internal Server Error');
                return Promise.resolve();
            })
            .catch(err => Promise.reject(err));
    });

    it('should fail to save config', () => {
        const errMsg = 'saveStateError';
        persistentStorage.set = () => Promise.reject(new Error(errMsg));

        return config.saveConfig()
            .then(() => {
                assert.fail('Should throw an error');
            })
            .catch((err) => {
                if (err.code === 'ERR_ASSERTION') return Promise.reject(err);
                if (RegExp(errMsg).test(err)) return Promise.resolve();
                assert.fail(err);
                return Promise.reject(err);
            });
    });

    it('should fail to load config', () => {
        const errMsg = 'loadStateError';
        persistentStorage.get = () => Promise.reject(new Error(errMsg));

        return config.loadConfig()
            .then(() => {
                assert.fail('Should throw an error');
            })
            .catch((err) => {
                if (err.code === 'ERR_ASSERTION') return Promise.reject(err);
                if (RegExp(errMsg).test(err)) return Promise.resolve();
                assert.fail(err);
                return Promise.reject(err);
            });
    });

    it('should fail to set config when invalid config provided', () => config.setConfig({})
        .then(() => {
            assert.fail('Should throw an error');
        })
        .catch((err) => {
            if (err.code === 'ERR_ASSERTION') return Promise.reject(err);
            if (/Missing parsed config/.test(err)) return Promise.resolve();
            assert.fail(err);
            return Promise.reject(err);
        }));

    it('should able to get declaration by name', () => {
        const obj = {
            class: 'Telemetry',
            My_System: {
                class: 'Telemetry_System',
                systemPoller: 'My_Poller'
            },
            My_Poller: {
                class: 'Telemetry_System_Poller'
            }
        };
        return config.validate(obj)
            .then((validated) => {
                validated = util.formatConfig(validated);
                const poller = util.getDeclarationByName(
                    validated, constants.SYSTEM_POLLER_CLASS_NAME, 'My_Poller'
                );
                assert.strictEqual(poller.class, constants.SYSTEM_POLLER_CLASS_NAME);
            });
    });
});
