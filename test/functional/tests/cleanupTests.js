/*
 * Copyright 2020. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */

const fs = require('fs');

const constants = require('../../constants.js');
const utils = require('../../shared/util.js');
const funcUtils = require('./shared/util.js');

// create log output directory for later use
funcUtils.createDirectory(constants.ARTIFACTS_LOGS_DIR);

const duts = funcUtils.getHostInfo();
duts.forEach((dut) => {
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

        it('should get restnoded log file contents', () => {
            const uri = '/mgmt/tm/util/bash';

            options.method = 'POST';
            options.body = {
                command: 'run',
                utilCmdArgs: `-c "cat /var/log/restnoded/restnoded.log | grep ${constants.PKG_NAME}"`
            };
            return utils.makeRequest(dutHost, uri, options)
                .then((data) => {
                    fs.writeFileSync(
                        `${constants.ARTIFACTS_LOGS_DIR}/restnoded_${dutHost}.log`,
                        data.commandResult
                    );
                })
                .catch(err => Promise.reject(err));
        });
    });
});
