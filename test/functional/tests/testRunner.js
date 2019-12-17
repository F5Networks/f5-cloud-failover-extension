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

// add test files in a defined order
const testFiles = [];
// system tests
if (process.env.CF_ENV_SYSTEM_TESTS !== 'ignore') {
    testFiles.push('./systemTests.js');
}
// specific provider tests
if (process.env.CF_ENV_PROVIDER_TESTS !== 'ignore') {
    testFiles.push(`./providers/${funcUtils.getEnvironmentInfo().environment}/tests.js`);
}

testFiles.forEach((file) => {
    require(file);
});
