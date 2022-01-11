/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const fs = require('fs');
const assert = require('assert');

const constants = require('../../constants.js');
const utils = require('../../shared/util.js');
const funcUtils = require('./shared/util.js');

const RETRIES = constants.RETRIES;

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter((dut) => dut.primary)[0];
const dutSecondary = duts.filter((dut) => !dut.primary)[0];

describe('Performance Tests', () => {
    let startTimestamp;

    before(function () {
        this.timeout(10000);

        return Promise.all([
            utils.getAuthToken(dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password),
            utils.getAuthToken(dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password)
        ])
            .then((results) => {
                dutPrimary.authData = results[0];
                dutSecondary.authData = results[1];
            })
            .catch((err) => Promise.reject(err));
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should ensure BIG-IP (secondary) is not primary', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
    ));

    it('should wait until taskState is success on BIG-IP (primary)', function () {
        this.retries(RETRIES.MEDIUM);

        return new Promise(
            (resolve) => setTimeout(resolve, 5000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutPrimary.ip,
                {
                    taskState: constants.FAILOVER_STATES.PASS,
                    authToken: dutPrimary.authData.token,
                    port: dutPrimary.port
                }))
            .then((data) => {
                assert(data.boolean, data);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should reset failover state file', () => {
        const uri = constants.RESET_ENDPOINT;
        return utils.makeRequest(dutPrimary.ip, uri, {
            method: 'POST',
            body: { resetStateFile: true },
            headers: {
                'x-f5-auth-token': dutPrimary.authData.token
            },
            port: dutPrimary.port
        })
            .then((data) => {
                data = data || {};
                assert.strictEqual(data.message, constants.STATE_FILE_RESET_MESSAGE);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should set start timestamp', () => {
        startTimestamp = new Date().toJSON();
    });

    it('should force BIG-IP (primary) to standby', () => funcUtils.forceStandby(
        dutPrimary.ip, dutPrimary.port, dutPrimary.username, dutPrimary.password
    ));

    it('should wait until taskState is success on BIG-IP (secondary)', function () {
        this.retries(RETRIES.MEDIUM);

        return new Promise(
            (resolve) => setTimeout(resolve, 5000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutSecondary.ip,
                {
                    taskState: constants.FAILOVER_STATES.PASS,
                    authToken: dutSecondary.authData.token,
                    hostname: dutSecondary.hostname,
                    port: dutSecondary.port
                }))
            .then((data) => {
                assert(data.boolean, data);
            })
            .catch((err) => Promise.reject(err));
    });

    it('should collect task state information', function () {
        this.retries(RETRIES.SHORT);

        return new Promise(
            (resolve) => setTimeout(resolve, 5000)
        )
            .then(() => funcUtils.getTriggerTaskStatus(dutSecondary.ip,
                {
                    taskState: constants.FAILOVER_STATES.PASS,
                    authToken: dutSecondary.authData.token,
                    hostname: dutSecondary.hostname,
                    port: dutSecondary.port
                }))
            .then((data) => {
                const taskStatus = data.taskStateResponse;
                const privateAddressCount = funcUtils.privateAddressesCount(taskStatus);
                fs.writeFileSync(
                    `${constants.ARTIFACTS_LOGS_DIR}/perfTest.json`,
                    utils.stringify({
                        startTimestamp,
                        endTimestamp: taskStatus.timestamp,
                        timestampDeltaInSeconds: Math.ceil((
                            new Date(taskStatus.timestamp) - new Date(startTimestamp)
                        ) / 1000),
                        routeOperationsCount: taskStatus.failoverOperations.routes.operations
                            ? taskStatus.failoverOperations.routes.operations.length
                            : taskStatus.failoverOperations.routes.length,
                        publicAddressOperationsCount: Object.keys(
                            taskStatus.failoverOperations.addresses.publicAddresses
                        ).length,
                        privateAddressOperationsCount: privateAddressCount
                    })
                );
            })
            .catch((err) => Promise.reject(err));
    });

    it('should force BIG-IP (secondary) to standby', () => funcUtils.forceStandby(
        dutSecondary.ip, dutSecondary.port, dutSecondary.username, dutSecondary.password
    ));
});
