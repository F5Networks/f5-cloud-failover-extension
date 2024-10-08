/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mustache = require('mustache'); /* eslint-disable-line import/no-extraneous-dependencies */

const icrdk = require('icrdk'); // eslint-disable-line import/no-extraneous-dependencies
const utils = require('../../../shared/util.js');
const constants = require('../../../constants.js');

const deploymentFile = process.env[constants.DEPLOYMENT_FILE_VAR]
    || path.join(process.cwd(), constants.DEPLOYMENT_FILE);

mustache.escape = function (text) { return text; }; // disable HTML escaping (default in mustache.js)

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
                port: item.mgmt_port,
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
        // Populate next hop addresses from route tables
        const nextHopAddresses = [];
        deploymentInfo.instances.forEach((instance) => {
            if (instance.next_hop_address) {
                nextHopAddresses.push(instance.next_hop_address);
            }
            if (instance.next_hop_address_ipv6) {
                nextHopAddresses.push(instance.next_hop_address_ipv6);
            }
        });
        // Populate virtual addresses
        const virtualAddresses = [];
        if (deploymentInfo.virtualAddresses) {
            deploymentInfo.virtualAddresses.forEach((virtualAddress) => {
                virtualAddresses.push(virtualAddress.address);
            });
        }
        // Populate alias addresses (GCP)
        const aliasAddresses = [];
        if (deploymentInfo.aliasAddresses) {
            deploymentInfo.aliasAddresses.forEach((aliasAddress) => {
                aliasAddresses.push(aliasAddress.address);
            });
        }
        // Populate target instances (GCP)
        const targetInstances = [];
        deploymentInfo.instances.forEach((instance) => {
            if (instance.hostname) {
                targetInstances.push(instance.hostname);
            }
        });
        return {
            nextHopAddresses,
            virtualAddresses,
            environment: deploymentInfo.environment,
            deploymentId: deploymentInfo.deploymentId,
            bucketName: deploymentInfo.bucketName,
            routeTables: deploymentInfo.routeTables,
            region: deploymentInfo.region || null, // optional: used by AWS|GCP
            elasticIps: deploymentInfo.elasticIps || [], // optional: used by AWS
            networkTopology: deploymentInfo.networkTopology || null, // optional: used by AWS
            aliasAddresses: aliasAddresses || [], // optional: used by GCP
            forwardingRule: deploymentInfo.forwardingRule || null, // optional: used by GCP
            forwardingRuleName: deploymentInfo.forwardingRuleName || '', // optional: used by GCP
            targetInstances: targetInstances || [], // optional: used by GCP
            zones: deploymentInfo.instances.map((i) => i.zone) // optional: used by GCP
        };
    },

    /**
     * Get deployment declaration
     *
     * @param {String} declarationLocation - Location of declaration mustache file
     *
     * @returns {Object} Returns rendered example declaration
     */
    getDeploymentDeclaration(declarationLocation) {
        const declarationTemplate = path.join(__dirname, './', declarationLocation);
        const environmentInfo = this.getEnvironmentInfo();

        const collapsedRoutes = Array.prototype.concat.apply(
            [], environmentInfo.routeTables.map((routeTable) => routeTable.routes)
        ).filter((route) => route !== '');

        const declarationData = {
            deploymentId: environmentInfo.deploymentId,
            environment: environmentInfo.environment,
            bucketName: environmentInfo.bucketName,
            forwardingRuleName: environmentInfo.forwardingRuleName,
            nextHopAddresses: environmentInfo.nextHopAddresses.map((nextHopAddress, idx) => ({
                address: nextHopAddress,
                last: environmentInfo.nextHopAddresses.length - 1 === idx
            })),
            scopingAddressRanges: collapsedRoutes.map((route, idx) => ({
                range: route, last: collapsedRoutes.length - 1 === idx
            })),
            virtualAddresses: environmentInfo.virtualAddresses.map((address, idx) => ({
                scopingAddress: address,
                last: environmentInfo.virtualAddresses.length - 1 === idx
            })),
            elasticIps: environmentInfo.elasticIps.map((elasticIp, idx) => ({
                scopingAddress: elasticIp.scopingAddress,
                vipAddresses: elasticIp.vipAddresses,
                last: environmentInfo.elasticIps.length - 1 === idx
            })),
            aliasAddresses: environmentInfo.aliasAddresses.map((address, idx) => ({
                scopingAddress: address,
                last: environmentInfo.aliasAddresses.length - 1 === idx
            })),
            targetInstances: environmentInfo.targetInstances.map((instance, idx) => ({
                targetInstance: instance,
                last: environmentInfo.targetInstances.length - 1 === idx
            }))
        };
        const renderedData = mustache.render(fs.readFileSync(declarationTemplate).toString(), declarationData);
        return JSON.parse(renderedData);
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
     * @param {String} port     - port
     * @param {String} username - host username
     * @param {String} password - host password
     *
     * @returns {Promise}
     */
    forceStandby(host, port, username, password) {
        const uri = '/mgmt/tm/sys/failover';
        return utils.getAuthToken(host, port, username, password)
            .then((data) => {
                const options = this.makeOptions({ authToken: data.token });
                options.method = 'POST';
                options.body = {
                    command: 'run',
                    standby: true
                };
                options.port = port;
                return utils.makeRequest(host, uri, options);
            })
            .catch((err) => Promise.reject(err));
    },

    /**
     * Get request to the trigger endpoint of a BIG-IP
     *
     * @param {String}  host                - host address
     * @param {Object}  options             - function options
     * @param {String} [options.authToken]  - Authentication token
     * @param {String} [options.port]       - port
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
        httpOptions.port = options.port;
        return utils.makeRequest(host, uri, httpOptions)
            .then((data) => {
                if (taskStates.indexOf(data.taskState) === -1
                    || (options.hostname && data.instance.indexOf(options.hostname) === -1)) {
                    return Promise.resolve({ boolean: false, taskStateResponse: data });
                }
                return Promise.resolve({ boolean: true, taskStateResponse: data });
            })
            .catch((err) => Promise.reject(err));
    },

    /**
     * Invoke dry-run via a POST to trigger endpoint of a BIG-IP
     *
     * @param {String}  host                - host address
     * @param {Object}  options             - function options
     * @param {String} [options.authToken]  - Authentication token
     * @param {String} [options.port]       - port
     * @param {String} [options.hostname]   - hostname
     *
     * @returns {Promise} Resolved with data returned from dry-run
     */
    invokeFailoverDryRun(host, options) {
        const uri = constants.TRIGGER_ENDPOINT;
        options = options || {};

        const httpOptions = this.makeOptions({ authToken: options.authToken });
        httpOptions.method = 'POST';
        httpOptions.port = options.port;
        httpOptions.body = { action: 'dry-run' };
        return utils.makeRequest(host, uri, httpOptions)
            .then((data) => Promise.resolve(data))
            .catch((err) => Promise.reject(err));
    },

    /**
     * Get request to the inspect endpoint of a BIG-IP
     *
     * @param {String}  host                  - host address
     * @param {Object}  options               - function options
     * @param {Object}  [options.port]        - port
     * @param {String}  [options.authToken]   - Authentication token
     *
     * @returns {Promise}
     */
    getInspectStatus(host, options) {
        const uri = constants.INSPECT_ENDPOINT;
        options = options || {};
        const httpOptions = this.makeOptions({ authToken: options.authToken });
        httpOptions.method = 'GET';
        httpOptions.port = options.port;
        return utils.makeRequest(host, uri, httpOptions);
    },

    /**
     * Install ILX package
     *
     * @param {String} host      - host
     * @param {String} port      - port
     * @param {String} authToken - auth token
     * @param {String} file      - local file (RPM) to install
     *
     * @returns {Promise} Returns promise resolved upon completion
     */
    installPackage(host, port, authToken, file) {
        const opts = {
            HOST: host,
            PORT: port,
            AUTH_TOKEN: authToken,
            headers: {
                'x-f5-auth-token': authToken
            }
        };

        return new Promise((resolve, reject) => {
            icrdk.deployToBigIp(opts, file, (err) => {
                if (err) {
                    if (/already installed/.test(err)) {
                        resolve();
                    } else {
                        reject(err);
                    }
                } else {
                    resolve();
                }
            });
        });
    },

    /**
     * Uninstall ILX package
     *
     * @param {String} host      - host
     * @param {String} port      - port
     * @param {String} authToken - auth token
     * @param {String} pkg       - package to remove from device
     *
     * @returns {Promise} Returns promise resolved upon completion
     */
    uninstallPackage(host, port, authToken, pkg) {
        const opts = {
            HOST: host,
            PORT: port,
            AUTH_TOKEN: authToken,
            headers: {
                'x-f5-auth-token': authToken
            }
        };

        return new Promise((resolve, reject) => {
            icrdk.uninstallPackage(opts, pkg, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    },
    /**
     * Query installed ILX packages
     *
     * @param {String} host      - host
     * @param {String} port      - port
     * @param {String} authToken - auth token
     *
     * @returns {Promise} Returns promise resolved upon completion
     */
    queryPackages(host, port, authToken) {
        const opts = {
            HOST: host,
            PORT: port,
            AUTH_TOKEN: authToken,
            // below should not be required, there is a bug in icrdk
            // https://github.com/f5devcentral/f5-icontrollx-dev-kit/blob/master/lib/util.js#L322
            headers: {
                'x-f5-auth-token': authToken
            }
        };

        return new Promise((resolve, reject) => {
            icrdk.queryInstalledPackages(opts, (err, results) => {
                if (err) {
                    reject(err);
                }
                resolve(results);
            });
        });
    },

    /**
     * Get package details
     *
     * @returns {Object} { name: 'foo.rpm', path: '/tmp/foo.rpm' }
     */
    getPackageDetails() {
        const dir = `${__dirname}/../../../../dist/new_build`;
        const distFiles = fs.readdirSync(dir);
        const packageFiles = distFiles.filter((f) => f.endsWith('.rpm'));

        // get latest rpm file (by timestamp since epoch)
        // note: this might not work if the artifact resets the timestamps
        const latest = { file: null, time: 0 };
        packageFiles.forEach((f) => {
            const fStats = fs.lstatSync(`${dir}/${f}`);
            if (fStats.birthtimeMs >= latest.time) {
                latest.file = f;
                latest.time = fStats.birthtimeMs;
            }
        });
        const packageFile = latest.file;

        return { name: packageFile, path: dir };
    },

    /** Create directory
     *
     * @param {String} path - file path
     */
    createDirectory(_path) {
        if (!fs.existsSync(_path)) {
            try {
                fs.mkdirSync(_path);
            } catch (err) {
                if (err.code !== 'EEXIST') {
                    throw err;
                }
            }
        }
    },

    /**
    * Private Addresses Count - which handles Azure and GCP associate private addresses count
    *
    * @param {Object} taskStatus  - taskStatus
    *
    * @returns {Object}
    */
    privateAddressesCount(taskStatus) {
        const environment = this.getEnvironmentInfo().environment;
        let associatePrivateIP = 0;
        const associateOperations = taskStatus.failoverOperations.addresses.interfaces.associate;
        (environment !== 'aws' && associateOperations.length ? associateOperations[0] : []).forEach((obj) => {
            if (obj.properties && obj.properties.ipConfigurations) {
                associatePrivateIP = obj.properties.ipConfigurations.length;
            }
            if (obj.aliasIpRanges) {
                associatePrivateIP = obj.aliasIpRanges.length;
            }
        });
        return associatePrivateIP;
    }
};
