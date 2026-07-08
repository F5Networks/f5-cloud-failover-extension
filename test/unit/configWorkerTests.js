/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */

const assert = require('assert');
const sinon = require('sinon');

const constants = require('../constants.js');
const utils = require('../shared/util.js');

const declaration = constants.declarations.basic;
const declarationWithControls = constants.declarations.basicWithLogging;
const declarationWithStateFileName = constants.declarations.basicWithStateFileName;

describe('Config Worker', () => {
    let config;
    let mockExecuteBigIpBashCmd;
    let Device;
    let logger;

    before(() => {
        config = require('../../src/nodejs/config.js');
        Device = require('../../src/nodejs/device');
        logger = require('../../src/nodejs/logger');
    });
    beforeEach(() => {
        sinon.stub(Device.prototype, 'init').resolves();
        sinon.stub(Device.prototype, 'getDataGroups').resolves({ exists: true, data: constants.DATA_GROUP_OBJECT });
        sinon.stub(Device.prototype, 'createDataGroup').resolves(constants.DATA_GROUP_OBJECT);
        sinon.spy(logger, 'setLogLevel');
        mockExecuteBigIpBashCmd = sinon.stub(Device.prototype, 'executeBigIpBashCmd').resolves('');
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });
    afterEach(() => {
        sinon.restore();
    });

    it('should process request', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then((response) => {
            assert.strictEqual(response.class, declaration.class);
        }));

    it('should process request with controls', () => config.init()
        .then(() => config.processConfigRequest(declarationWithControls))
        .then((response) => {
            assert(logger.setLogLevel.calledOnce);
            assert.strictEqual(response.class, declaration.class);
        }));

    it('validate error case for init method', () => config.init()
        .then(() => {
            // fails in a case when promise is resolved
            assert.fail();
        })
        .catch(() => {
            // succeeds when error recieved
            assert.ok(true);
        }));

    it('should reject and log when init cannot load state', () => {
        const srcUtil = require('../../src/nodejs/util.js');
        // run the retried function once (no real retries) so the failure surfaces quickly
        sinon.stub(srcUtil, 'retrier').callsFake((fn, args, options) => fn.apply(options.thisArg, args));
        Device.prototype.getDataGroups.restore();
        sinon.stub(Device.prototype, 'getDataGroups').rejects(new Error('init load failure'));

        return config.init()
            .then(() => {
                assert.fail('Expected init to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'init load failure');
            });
    });

    it('validate error case for setConfig method', () => {
        Device.prototype.getDataGroups.restore();
        sinon.stub(Device.prototype, 'getDataGroups').rejects();

        return config.setConfig({})
            .then(() => {
                // fails in a case when promise is resolved
                assert.fail();
            })
            .catch(() => {
                // succeeds when error recieved
                assert.ok(true);
            });
    });

    it('should reject invalid declaration', () => config.init()
        .then(() => config.processConfigRequest({ foo: 'bar' }))
        .then(() => {
            assert.fail('Should throw an error');
        })
        .catch((err) => {
            if (err.message.includes('Invalid declaration')) return Promise.resolve();

            return Promise.reject(err);
        }));

    it('should get config', () => config.init()
        .then(() => config.processConfigRequest(declaration))
        .then(() => config.getConfig())
        .then((response) => {
            assert.strictEqual(response.class, declaration.class);
        })
        .catch((err) => Promise.reject(err)));

    it('should process request with a custom external storage state file name', () => config.init()
        .then(() => config.processConfigRequest(declarationWithStateFileName))
        .then((response) => {
            // externalStorage.stateFileName branch sets the state file name
            assert.strictEqual(response.class, declaration.class);
            assert.strictEqual(config.state.stateFileName, 'custom-state-file.json');
        })
        .catch((err) => Promise.reject(err)));

    it('should get state file name', () => {
        const storedState = {
            config: { class: 'Cloud_Failover' },
            stateFileName: 'custom-state-file.json'
        };
        Device.prototype.getDataGroups.restore();
        sinon.stub(Device.prototype, 'getDataGroups').resolves({
            exists: true,
            data: { records: [{ data: utils.base64('encode', JSON.stringify(storedState)) }] }
        });

        return config.getStateFileName()
            .then((stateFileName) => {
                assert.strictEqual(stateFileName, 'custom-state-file.json');
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject from getStateFileName when state load fails', () => {
        Device.prototype.getDataGroups.restore();
        sinon.stub(Device.prototype, 'getDataGroups').rejects(new Error('load failure'));

        return config.getStateFileName()
            .then(() => {
                assert.fail('Expected getStateFileName to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'load failure');
            });
    });

    it('should reject from getConfig when state load fails', () => {
        Device.prototype.getDataGroups.restore();
        sinon.stub(Device.prototype, 'getDataGroups').rejects(new Error('getConfig load failure'));

        return config.getConfig()
            .then(() => {
                assert.fail('Expected getConfig to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'getConfig load failure');
            });
    });

    it('should reject from setConfig when saving state fails', () => {
        Device.prototype.createDataGroup.restore();
        sinon.stub(Device.prototype, 'createDataGroup').rejects(new Error('save failure'));

        return config.setConfig({ class: 'Cloud_Failover' })
            .then(() => {
                assert.fail('Expected setConfig to reject');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'save failure');
            });
    });

    it('should default state file name in setConfig when not provided', () => config.setConfig({ class: 'Cloud_Failover' })
        .then(() => {
            // stateFileName defaults to the built-in default when omitted
            assert.strictEqual(config.state.stateFileName, 'f5cloudfailoverstate.json');
        })
        .catch((err) => Promise.reject(err)));

    it('should default to an empty config object in setConfig when config is falsy', () => config.setConfig()
        .then(() => {
            assert.deepStrictEqual(config.state.config, {});
        })
        .catch((err) => Promise.reject(err)));

    it('should resolve default state when the data group does not exist', () => {
        Device.prototype.getDataGroups.restore();
        sinon.stub(Device.prototype, 'getDataGroups').resolves({ exists: false });

        return config.getConfig()
            .then((conf) => {
                // _loadStateFromStore returns the default object when the group is absent
                assert.deepStrictEqual(conf, {});
            })
            .catch((err) => Promise.reject(err));
    });

    it('should resolve default state when data group exists but has no data', () => {
        Device.prototype.getDataGroups.restore();
        // exists is true but data is falsy, so _parseStateFromDataGroup returns the default
        sinon.stub(Device.prototype, 'getDataGroups').resolves({ exists: true, data: null });

        return config.getConfig()
            .then((conf) => {
                assert.deepStrictEqual(conf, {});
            })
            .catch((err) => Promise.reject(err));
    });

    it('should default state and warn when data group records are malformed', () => {
        sinon.spy(logger, 'warning');
        Device.prototype.getDataGroups.restore();
        // data group exists but records cannot be JSON-parsed
        sinon.stub(Device.prototype, 'getDataGroups').resolves({
            exists: true,
            data: { records: [{ data: 'not-valid-base64-json' }] }
        });

        return config.getConfig()
            .then((conf) => {
                // parse failure is caught and the default config object is returned
                assert.deepStrictEqual(conf, {});
                assert.strictEqual(logger.warning.called, true);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reject if poorly formatted', () => {
        const errMsg = 'no bigip here';
        mockExecuteBigIpBashCmd.rejects(new Error(errMsg));

        return config.init()
            .then(() => config.processConfigRequest(declaration))
            .then(() => {
                assert.fail('processConfigRequest() should have caught and rejected.');
            })
            .catch((err) => {
                assert.ok(true);
                assert.strictEqual(err.message, errMsg);
            });
    });

    describe('BIG-IP trigger script generation', () => {
        const originalContents = 'my trigger file contents';
        const triggerCommand = `${constants.TRIGGER_COMMENT}\n${constants.TRIGGER_COMMAND}`;

        function getFailoverScriptContents(command) {
            return utils.base64('decode', command.substring(
                command.lastIndexOf('echo "') + 6,
                command.lastIndexOf('" | base64 --decode >')
            ));
        }

        it('should check failover script(s) get trigger call added', () => {
            mockExecuteBigIpBashCmd.resolves(originalContents);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => {
                    // should be called 4 times, list and update for tgactive/tgrefresh
                    assert.strictEqual(mockExecuteBigIpBashCmd.callCount, 4);
                    // get updated script contents
                    const updateScriptCommand = mockExecuteBigIpBashCmd.getCall(2).args[0];
                    const scriptContents = getFailoverScriptContents(updateScriptCommand);
                    assert.strictEqual(scriptContents, `${originalContents}\n${triggerCommand}`);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should check failover script(s) get trigger call updated', () => {
            mockExecuteBigIpBashCmd.resolves(
                `${originalContents}\n${constants.TRIGGER_COMMENT}\ncurl replace.me`
            );

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => {
                    // should be called 4 times, list and update for tgactive/tgrefresh
                    assert.strictEqual(mockExecuteBigIpBashCmd.callCount, 4);
                    // get updated script contents
                    const updateScriptCommand = mockExecuteBigIpBashCmd.getCall(2).args[0];
                    const scriptContents = getFailoverScriptContents(updateScriptCommand);
                    assert.strictEqual(scriptContents, `${originalContents}\n${triggerCommand}`);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should check failover script(s) get trigger call updated (leaves additional text intact)', () => {
            mockExecuteBigIpBashCmd.resolves(
                `${originalContents}\n${constants.TRIGGER_COMMENT}\ncurl replace.me\n\necho keepme`
            );

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => {
                    // should be called 4 times, list and update for tgactive/tgrefresh
                    assert.strictEqual(mockExecuteBigIpBashCmd.callCount, 4);
                    // get updated script contents
                    const updateScriptCommand = mockExecuteBigIpBashCmd.getCall(2).args[0];
                    const scriptContents = getFailoverScriptContents(updateScriptCommand);
                    assert.strictEqual(scriptContents, `${originalContents}\n${triggerCommand}\n\necho keepme`);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should check failover script(s) do not add trigger call when already added', () => {
            mockExecuteBigIpBashCmd.resolves(`${originalContents}\n${triggerCommand}`);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => {
                    // should be called 2 times, list for tgactive/tgrefresh
                    assert.strictEqual(mockExecuteBigIpBashCmd.callCount, 2);
                })
                .catch((err) => Promise.reject(err));
        });

        it('should check Azure legacy failover script call gets disabled', () => {
            mockExecuteBigIpBashCmd.resolves(`${originalContents}\n${constants.LEGACY_TRIGGER_COMMAND.AZURE}`);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => {
                    // should be called 4 times, list and update for tgactive/tgrefresh
                    assert.strictEqual(mockExecuteBigIpBashCmd.callCount, 4);
                    // get updated script contents
                    const updateScriptCommand = mockExecuteBigIpBashCmd.getCall(2).args[0];
                    const scriptContents = getFailoverScriptContents(updateScriptCommand);
                    assert.strictEqual(
                        scriptContents,
                        `${originalContents}\n${constants.LEGACY_TRIGGER_COMMENT}\n#${constants.LEGACY_TRIGGER_COMMAND.AZURE}\n${triggerCommand}`
                    );
                })
                .catch((err) => Promise.reject(err));
        });

        it('should check GCP legacy failover script call gets disabled', () => {
            mockExecuteBigIpBashCmd.resolves(`${originalContents}\n${constants.LEGACY_TRIGGER_COMMAND.GCP}`);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => {
                    // should be called 4 times, list and update for tgactive/tgrefresh
                    assert.strictEqual(mockExecuteBigIpBashCmd.callCount, 4);
                    // get updated script contents
                    const updateScriptCommand = mockExecuteBigIpBashCmd.getCall(2).args[0];
                    const scriptContents = getFailoverScriptContents(updateScriptCommand);
                    assert.strictEqual(
                        scriptContents,
                        `${originalContents}\n${constants.LEGACY_TRIGGER_COMMENT}\n#${constants.LEGACY_TRIGGER_COMMAND.GCP}\n${triggerCommand}`
                    );
                })
                .catch((err) => Promise.reject(err));
        });
    });
});
