/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

/* eslint-disable import/no-extraneous-dependencies */
const { google } = require('googleapis');

const compute = google.compute('v1');

/*
const utils = require('../../../../shared/util.js');
const funcUtils = require('../../shared/util.js');

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];

const deploymentInfo = funcUtils.getEnvironmentInfo();
const rgName = deploymentInfo.deploymentId;

const declaration = funcUtils.getDeploymentDeclaration();
const networkInterfaceTagKey = Object.keys(declaration.failoverAddresses.scopingTags)[0];
const networkInterfaceTagValue = declaration.failoverAddresses.scopingTags[networkInterfaceTagKey];
const routeTagKey = Object.keys(declaration.failoverRoutes.scopingTags)[0];
const routeTagValue = declaration.failoverRoutes.scopingTags[routeTagKey];
*/

// Helper functions

const configureAuth = () => {
    if (process.env.GOOGLE_CREDENTIALS) {
        return google.auth.getClient({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
    }
    return Promise.reject(new Error('gcloud creds are not provided via env variable titled as GOOGLE_CREDENTIALS'));
};

let request = {};

describe('Provider: GCP', () => {
    before(() => configureAuth()
        .then((authClient) => {
            request = {
                project: JSON.parse(process.env.GOOGLE_CREDENTIALS).project_id,
                auth: authClient,
                zone: 'us-west1-a'
            };
        }).catch(err => Promise.reject(err)));
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('init test', () => {
        compute.instances.list(request, (err, vmData) => {
            assert.strictEqual(vmData, err);
        });
    });
});
