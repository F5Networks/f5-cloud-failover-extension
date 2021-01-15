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
        .catch(err => Promise.reject(err)));

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
                .catch(err => Promise.reject(err));
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
                .catch(err => Promise.reject(err));
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
                .catch(err => Promise.reject(err));
        });

        it('should check failover script(s) do not add trigger call when already added', () => {
            mockExecuteBigIpBashCmd.resolves(`${originalContents}\n${triggerCommand}`);

            return config.init()
                .then(() => config.processConfigRequest(declaration))
                .then(() => {
                    // should be called 2 times, list for tgactive/tgrefresh
                    assert.strictEqual(mockExecuteBigIpBashCmd.callCount, 2);
                })
                .catch(err => Promise.reject(err));
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
                .catch(err => Promise.reject(err));
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
                .catch(err => Promise.reject(err));
        });
    });
});
