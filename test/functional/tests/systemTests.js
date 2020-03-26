/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */

const assert = require('assert');

const constants = require('../../constants.js');
const utils = require('../../shared/util.js');
const funcUtils = require('./shared/util.js');
const version = require('../../../package.json').version;

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

const packageDetails = funcUtils.getPackageDetails();
const packageFile = packageDetails.name;
const packagePath = packageDetails.path;

const clusterMembers = [dutPrimary, dutSecondary];
const clusterMemberIps = clusterMembers.map(member => member.ip);
const exampleDeclaration = require('./shared/exampleDeclaration.json');

clusterMembers.forEach((dut) => {
    describe(`DUT - ${dut.ip} (${dut.primary})`, () => {
        const dutHost = dut.ip;
        const dutPort = dut.port;
        const dutUser = dut.username;
        const dutPassword = dut.password;

        let authToken = null;
        let options = {};

        before(() => utils.getAuthToken(dutHost, dutPort, dutUser, dutPassword)
            .then((data) => {
                authToken = data.token;
                options = {
                    headers: {
                        'x-f5-auth-token': authToken
                    },
                    port: dutPort
                };
            }));
        beforeEach(() => {
        });
        after(() => {
            Object.keys(require.cache).forEach((key) => {
                delete require.cache[key];
            });
        });

        it('should uninstall package (if exists)', () => {
            const packageName = constants.PKG_NAME;
            return funcUtils.queryPackages(dutHost, dutPort, authToken)
                .then((data) => {
                    data = data.queryResponse || [];
                    return Promise.resolve(data.filter(pkg => pkg.packageName.includes(packageName)));
                })
                .then(pkgs => Promise.all(pkgs
                    .map(pkg => funcUtils.uninstallPackage(dutHost, dutPort, authToken, pkg.packageName))))
                .catch(err => Promise.reject(err));
        });

        it(`should install package: ${packageFile}`, () => {
            const fullPath = `${packagePath}/${packageFile}`;
            return funcUtils.installPackage(dutHost, dutPort, authToken, fullPath)
                .catch(err => Promise.reject(err));
        });

        it('should wait 5 seconds before verify installation', () => new Promise(
            resolve => setTimeout(resolve, 5000)
        ));

        it('should verify installation', function () {
            this.retries(constants.RETRIES.LONG);
            const uri = constants.INFO_ENDPOINT;

            return utils.makeRequest(dutHost, uri, options)
                .then((data) => {
                    data = data || {};
                    assert.strictEqual(data.version, version);
                })
                .catch(err => Promise.reject(err));
        });

        it('should get version info', () => {
            const uri = constants.INFO_ENDPOINT;

            options.method = 'GET';
            return utils.makeRequest(dutHost, uri, options)
                .then((data) => {
                    data = data || {};
                    assert.strictEqual(data.version, version);
                })
                .catch(err => Promise.reject(err));
        });

        it('should post declaration', () => {
            const uri = constants.DECLARE_ENDPOINT;
            options.method = 'POST';
            options.body = funcUtils.getDeploymentDeclaration(exampleDeclaration);
            return utils.makeRequest(dutHost, uri, options)
                .then((data) => {
                    data = data || {};
                    assert.strictEqual(data.message, 'success');
                })
                .catch(err => Promise.reject(err));
        });

        it('should reset failover state file', () => {
            const uri = constants.RESET_ENDPOINT;

            options.method = 'POST';
            options.body = { resetStateFile: true };
            return utils.makeRequest(dutHost, uri, options)
                .then((data) => {
                    data = data || {};
                    assert.strictEqual(data.message, constants.STATE_FILE_RESET_MESSAGE);
                })
                .catch(err => Promise.reject(err));
        });

        // note: errors such as 'connection refused' may occurr without this waiting
        // should figure out a better mechanism to determine 'ready' state
        it('should wait 10 seconds before post trigger', () => new Promise(
            resolve => setTimeout(resolve, 10000)
        ));

        it('should post trigger', () => {
            const uri = constants.TRIGGER_ENDPOINT;

            options.method = 'POST';
            options.body = {};
            return utils.makeRequest(dutHost, uri, options)
                .then((data) => {
                    data = data || {};
                    assert.strictEqual(data.taskState, 'SUCCEEDED');
                })
                .catch(err => Promise.reject(err));
        });
    });
});

describe(`Cluster-wide system tests: ${utils.stringify(clusterMemberIps)}`, () => {
    const dutPort = duts.filter(dut => dut.port)[0].port;
    before(() => {
        const promises = [];
        clusterMembers.forEach((member) => {
            promises.push(utils.getAuthToken(member.ip, member.port, member.username, member.password)
                .then((authToken) => {
                    member.authToken = authToken.token;
                })
                .catch(err => Promise.reject(err)));
        });
        return Promise.all(promises)
            .catch(err => Promise.reject(err));
    });
    beforeEach(() => {
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('Should sync configuration', () => {
        const originalBody = funcUtils.getDeploymentDeclaration(exampleDeclaration);
        const modifiedBody = funcUtils.getDeploymentDeclaration(exampleDeclaration);
        modifiedBody.failoverAddresses.scopingTags = { foo: 'bar' };

        it('should post modified declaration (primary)', () => {
            const host = clusterMembers[0];

            const options = {
                headers: {
                    'x-f5-auth-token': host.authToken
                },
                method: 'POST',
                port: dutPort,
                body: modifiedBody
            };
            return utils.makeRequest(host.ip, constants.DECLARE_ENDPOINT, options)
                .then((data) => {
                    assert.strictEqual(data.message, 'success');
                })
                .catch(err => Promise.reject(err));
        });

        it('should get declaration (secondary) and verify it synced', function () {
            this.retries(constants.RETRIES.SHORT);
            const host = clusterMembers[1];

            const options = {
                headers: {
                    'x-f5-auth-token': host.authToken
                },
                port: dutPort
            };

            return utils.makeRequest(host.ip, constants.DECLARE_ENDPOINT, options)
                .then((data) => {
                    assert.strictEqual(data.message, 'success');
                    assert.deepStrictEqual(
                        data.declaration.failoverAddresses.scopingTags,
                        modifiedBody.failoverAddresses.scopingTags
                    );
                })
                .catch(err => Promise.reject(err));
        });

        it('should post original declaration (primary)', () => {
            const host = clusterMembers[0];

            const options = {
                headers: {
                    'x-f5-auth-token': host.authToken
                },
                method: 'POST',
                body: originalBody,
                port: dutPort
            };

            return utils.makeRequest(host.ip, constants.DECLARE_ENDPOINT, options)
                .then((data) => {
                    assert.strictEqual(data.message, 'success');
                })
                .catch(err => Promise.reject(err));
        });
    });
});
