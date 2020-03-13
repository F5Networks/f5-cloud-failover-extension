/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
const funcUtils = require('./shared/util.js');

/* This test runner will run test files in a defined order:
 * - System Tests
 * - Provider Tests
 * - Cleanup Tests
 *
 * Some of the tests can be optionally disable to speed up
 * local testing iterations
*/

const testFiles = [];
if (process.env.CF_ENV_SYSTEM_TESTS !== 'ignore') {
    testFiles.push('./systemTests.js');
}
if (process.env.CF_ENV_PROVIDER_TESTS !== 'ignore') {
    testFiles.push(`./providers/${funcUtils.getEnvironmentInfo().environment}/tests.js`);
}
testFiles.push('./cleanupTests.js');

testFiles.forEach((file) => {
    require(file);
});
