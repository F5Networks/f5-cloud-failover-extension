/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */

// Set up Chai
const chai = require('chai');

const expect = chai.expect;
const chaiResponseValidator = require('chai-openapi-response-validator');
const funcUtils = require('./shared/util.js');
const constants = require('../../constants.js');

// Import this plugin

const duts = funcUtils.getHostInfo();
const dutPrimary = duts.filter(dut => dut.primary)[0];
const dutSecondary = duts.filter(dut => !dut.primary)[0];
const utils = require('../../shared/util.js');

let authToken = null;

describe('GET /example/request', () => {
    before(() => {
    });
    beforeEach(() => utils.getAuthToken(dutPrimary.ip, dutPrimary.username, dutPrimary.password)
        .then((data) => {
            authToken = data.token;
            // Load an OpenAPI file (YAML or JSON) into this plugin
            chai.use(chaiResponseValidator('/Users/gasingh/git-projects/f5-cloud-failover/specs/openapi.yaml'));
            // Get an HTTP response using chai-http
            chai.use(require('chai-http'));
        }));
    after(() => {
        Object.keys(require.cache)
            .forEach((key) => {
                delete require.cache[key];
            });
    });
    it('should satisfy OpenAPI spec', (done) => {
        chai.request(`${constants.REQUEST.PROTOCOL }://${ dutPrimary.ip }:${ constants.REQUEST.PORT}`)
            .get(constants.DECLARE_ENDPOINT)
            .set('x-f5-auth-token', authToken)
            .then((res) => {
                // Assert that the HTTP response satisfies the OpenAPI spec
                expect(res).to.satisfyApiSpec;
                done();
            })
            .catch((err) => {
                throw err;
            });
    });

});
