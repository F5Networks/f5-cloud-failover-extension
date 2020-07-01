/*
 * Copyright 2020. F5 Networks, Inc. See End User License Agreement ("EULA") for
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
 * - System Tests (enabled by default)
 * - Provider Tests (enabled by default)
 * - Performance Tests (disabled by default)
 * - Cleanup Tests (always enabled)
 *
 * Most of the tests can be enabled/disabled via environment variables to
 * speed up local testing iterations
*/
const TOGGLES = {
    SYSTEM: process.env.CF_SYSTEM_TESTS || 'enabled',
    PROVIDER: process.env.CF_PROVIDER_TESTS || 'enabled',
    PERF: process.env.CF_PERF_TESTS || 'disabled'
};

const testFiles = [];
if (TOGGLES.SYSTEM === 'enabled') {
    testFiles.push('./systemTests.js');
}
if (TOGGLES.PROVIDER === 'enabled') {
    testFiles.push(`./providers/${funcUtils.getEnvironmentInfo().environment}/tests.js`);
}
if (TOGGLES.PERF === 'enabled') {
    testFiles.push('./performanceTests.js');
}
testFiles.push('./cleanupTests.js');

testFiles.forEach((file) => {
    require(file);
});
