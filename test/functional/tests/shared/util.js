/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const path = require('path');
const mustache = require('mustache'); /* eslint-disable-line import/no-extraneous-dependencies */

const utils = require('../../../shared/util.js');
const constants = require('../../../constants.js');

const deploymentFile = process.env[constants.DEPLOYMENT_FILE_VAR]
    || path.join(process.cwd(), constants.DEPLOYMENT_FILE);

module.exports = {
    /**
     * Get host info
     *
     * @returns {Object} Returns
     * [ { ip: x.x.x.x, username: admin, password: admin, primary: true } ]
     */
    getHostInfo() {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const hosts = require(deploymentFile).instances.map((item) => {
            item = {
                ip: item.mgmt_address,
                username: item.admin_username,
                password: item.admin_password,
                primary: item.primary,
                hostname: item.hostname,
                instanceId: item.instanceId
            };
            return item;
        });
        return hosts;
    },

    /**
     * Get environment info
     *
     * @returns {Object} Returns:
     *  {
     *      deploymentId: 'foo',
     *      environment: 'foo',
     *      region: 'foo',
     *      zone: 'foo',
     *      networkTopology: 'foo'
     *  }
     */
    getEnvironmentInfo() {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const deploymentInfo = require(deploymentFile);
        return {
            environment: deploymentInfo.environment,
            deploymentId: deploymentInfo.deploymentId,
            region: deploymentInfo.region || null, // optional: used by AWS|GCP
            zone: deploymentInfo.zone || null, // optional: used by GCP
            networkTopology: deploymentInfo.networkTopology || null // optional: used by AWS
        };
    },

    /**
     * Get deployment declaration
     *
     * @returns {Object} Returns rendered example declaration
     */
    getDeploymentDeclaration(declaration) {
        const environmentInfo = this.getEnvironmentInfo();
        return JSON.parse(mustache.render(utils.stringify(declaration), {
            deploymentId: environmentInfo.deploymentId,
            environment: environmentInfo.environment
        }));
    },

    /**
     * Make options (HTTP)
     *
     * @param {Object}  options            - function options
     * @param {String} [options.authToken] - Authentication token
     *
     * @returns {Object}
     */
    makeOptions(options) {
        options = options || {};

        const retOptions = {};
        if (options.authToken) {
            retOptions.headers = {
                'x-f5-auth-token': options.authToken
            };
        }
        return retOptions;
    },

    /**
     * Force a BIG-IP standby
     *
     * @param {String} host     - host address
     * @param {String} username - host username
     * @param {String} password - host password
     *
     * @returns {Promise}
     */
    forceStandby(host, username, password) {
        const uri = '/mgmt/tm/sys/failover';

        return utils.getAuthToken(host, username, password)
            .then((data) => {
                const options = this.makeOptions({ authToken: data.token });
                options.method = 'POST';
                options.body = {
                    command: 'run',
                    standby: true
                };
                return utils.makeRequest(host, uri, options);
            })
            .catch(err => Promise.reject(err));
    },

    /**
     * Get request to the trigger endpoint of a BIG-IP
     *
     * @param {String}  host                - host address
     * @param {Object}  options             - function options
     * @param {String} [options.authToken]  - Authentication token
     * @param {String} [options.hostname]   - hostname
     * @param {String} [options.taskState]  - taskState to check against, use this or taskStates
     * @param {Array} [options.taskStates]  - taskStates to check against, use this or taskState
     *
     * @returns {Promise} Resolved with task status: { 'boolean': true, 'taskStateResponse': {} }
     */
    getTriggerTaskStatus(host, options) {
        const uri = constants.TRIGGER_ENDPOINT;
        options = options || {};

        const taskStates = options.taskStates || [options.taskState] || [];

        const httpOptions = this.makeOptions({ authToken: options.authToken });
        httpOptions.method = 'GET';
        return utils.makeRequest(host, uri, httpOptions)
            .then((data) => {
                if (taskStates.indexOf(data.taskState) === -1
                    || data.instance.indexOf(options.hostname) === -1) {
                    return Promise.resolve({ boolean: false, taskStateResponse: data });
                }
                return Promise.resolve({ boolean: true, taskStateResponse: data });
            })
            .catch(err => Promise.reject(err));
    },

    /**
     * Get request to the inspect endpoint of a BIG-IP
     *
     * @param {String}  host                - host address
     * @param {Object}  options             - function options
     * @param {String} [options.authToken]  - Authentication token
     *
     * @returns {Promise}
     */
    getInspectStatus(host, options) {
        const uri = constants.INSPECT_ENDPOINT;
        options = options || {};
        const httpOptions = this.makeOptions({ authToken: options.authToken });
        httpOptions.method = 'GET';
        return utils.makeRequest(host, uri, httpOptions);
    }
};
