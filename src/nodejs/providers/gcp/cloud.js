/**
 * Copyright 2019 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const ipaddr = require('ipaddr.js');
const Compute = require('@google-cloud/compute');
const cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;
const httpUtil = require('@f5devcentral/f5-cloud-libs').httpUtil;
const CLOUD_PROVIDERS = require('../../constants').CLOUD_PROVIDERS;
const util = require('../../util.js');

const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;


class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.GCP, options);
        this.BASE_URL = 'https://www.googleapis.com/compute/v1';
        this.compute = new Compute();
    }


    /**
     * Initialize the Cloud Provider. Called at the beginning of processing, and initializes required cloud clients
     *
     * @param {Object} options        - function options
     * @param {Object} [options.tags] - object containing tags to filter on { 'key': 'value' }
     */
    init(options) {
        options = options || {};
        this.tags = options.tags || null;

        return Promise.all([
            this._getLocalMetadata('project/project-id'),
            this._getLocalMetadata('instance/service-accounts/default/token'),
            this._getLocalMetadata('instance/name'),
            this._getLocalMetadata('instance/zone')
        ])
            .then((data) => {
                this.projectId = data[0];
                this.accessToken = data[1].access_token;
                this.instanceName = data[2];
                this.instanceZone = data[3];
                // zone format: 'projects/734288666861/zones/us-west1-a'
                const parts = this.instanceZone.split('/');
                this.zone = parts[parts.length - 1];
                this.computeZone = this.compute.zone(this.zone);
                this.region = this.zone.substring(0, this.zone.lastIndexOf('-'));
                this.computeRegion = this.compute.region(this.region);

                this.logger.info('Getting GCP resources');
                const firstKey = Object.keys(this.tags)[0]; // should support multiple
                return Promise.all([
                    this._getVmsByTag({ key: firstKey, value: this.tags[firstKey] }),
                    this._getFwdRules(),
                    this._getTargetInstances()
                ]);
            })
            .then((vmsData) => {
                this.vms = vmsData[0];
                this.fwdRules = vmsData[1];
                this.targetInstances = vmsData[2];

                this.logger.info('GCP resources have been collected; gcp provider initialization is completed.');
                return Promise.resolve();
            })

            .catch(err => Promise.reject(err));
    }

    /**
     * Update Addresses
     *
     * @param {Object} localAddresses    - Local addresses
     * @param {String} failoverAddresses - Failover addresses
     *
     * @returns {Object}
     */
    updateAddresses(localAddresses, failoverAddresses) {
        return this._updateNics(localAddresses, failoverAddresses)
            .then(() => {
                this.logger.info('GCP Provider: ip re-association is completed. Updating forwarding rules.');
                const promises = [];
                promises.push(util.retrier.call(this, this._updateFwdRules,
                    [this.fwdRules, this.targetInstances, failoverAddresses]));
                return Promise.all(promises);
            })
            .then(() => {
                this.logger.info('GCP Provider: ip forwarding rules are updated.');
            })
            .catch(err => Promise.reject(err));
    }


    /**
     * Update Routes
     *
     * @param {Object} localAddresses    - Local addresses
     *
     * @returns {Object} promise
     */
    updateRoutes(ipAddresses) {
        this.logger.info('updateRoutes - Local addresses', ipAddresses);
        const localAddresses = ipAddresses.localAddresses;
        return this._getRoutes()
            .then((routesToUpdate) => {
                const result = [];
                routesToUpdate.forEach((route) => {
                    if (route.description.indexOf('ip_addresses') !== -1) {
                        const firstRouteIp = route.description.match(/ip_addresses=.*/g)[0].split('=')[1].split(',')[0];
                        const secondRouteIp = route.description.match(/ip_addresses=.*/g)[0].split('=')[1].split(',')[1];
                        route.nextHopIp = '';
                        localAddresses.forEach((ipAddr) => {
                            if (firstRouteIp === ipAddr) {
                                route.nextHopIp = firstRouteIp;
                            } else if (secondRouteIp === ipAddr) {
                                route.nextHopIp = secondRouteIp;
                            }
                        });
                        if (route.nextHopIp === '') {
                            this.logger.info('NextHopIp was not set; provided ipAddresses are not matching localAddresses');
                        }
                        result.push(route);
                        return route;
                    }

                    this.logger.info('Route object does not include ipAddresses, within description; however, the ipAddeses are required for failover');
                    this.logger.info(JSON.stringify(route));
                    return route;
                });

                this.logger.info('Routes with updated nextHopIp');
                this.logger.info(result);

                // Deleting routes
                const deletePromises = [];
                result.forEach((item) => {
                    deletePromises.push(this._sendRequest('DELETE', `global/routes/${item.id}`));
                    // Striping out unique fields in order to be able to re-use payload
                    delete item.id;
                    delete item.creationTimestamp;
                    delete item.kind;
                    delete item.selfLink;
                });


                if (result.length === 0) {
                    this.logger.info('No routes identified for update. If routes update required, provide failover ip addresses, matching localAdresses, in description field.');
                    return Promise.resolve('No routes identified for update. If routes update required, provide failover ip addresses, matching localAdresses, in description field.');
                }

                return Promise.all(deletePromises)
                    .then((response) => {
                        const operationPromises = [];
                        if (response) {
                            response.forEach((item) => {
                                const operation = this.compute.operation(item.name);
                                operationPromises.push(operation.promise());
                            });
                        }
                        return Promise.all(operationPromises);
                    })
                    .then((response) => {
                        this.logger.info('Routes have been successfully deleted. Re-creating routes with new nextHopIp');
                        this.logger.info(`Response: ${JSON.stringify(response)}`);
                        // Reacreating routes
                        this.logger.info(`Available Routes: ${JSON.stringify(result)}`);
                        const createPromises = [];
                        result.forEach((item) => {
                            createPromises.push(this._sendRequest('POST', 'global/routes/', item));
                        });
                        return Promise.all(createPromises);
                    })
                    .then((response) => {
                        this.logger.info('Routes have been successfully re-created. Route failover is completed now.');
                        this.logger.info(JSON.stringify(response));
                        return Promise.resolve();
                    });
            })
            .catch(err => Promise.reject(err));
    }


    /**
     * Returns routes objects used for failover; method uses routes' description values
     * to identify route objects to work with
     *
     * @returns {Promise} A promise which will provide list of routes which need to be updated
     *
     */
    _getRoutes() {
        this.logger.info(`_getRoutes with tags: ${JSON.stringify(this.tags)}`);

        return this._sendRequest(
            'GET',
            'global/routes'
        )
            .then((routesList) => {
                const routesToUpdate = [];
                const that = this;
                if (routesList.items.length > 0) {
                    routesList.items.forEach((tag) => {
                        if (tag.description.indexOf('labels=') !== -1
                            && tag.description.indexOf('ip_addresses=') !== -1) {
                            let flag = true;
                            for (let i = 0; i < Object.values(that.tags).length; i += 1) {
                                if (tag.description.indexOf(Object.keys(that.tags)[i]) === -1
                                    && tag.description.indexOf(Object.values(that.tags)[i]) === -1) {
                                    flag = false;
                                }
                            }
                            if (flag) {
                                that.logger.info(tag);
                                routesToUpdate.push(tag);
                            }
                        }
                    });
                } else {
                    this.logger.info('WARNING: No available routes found.');
                }
                this.logger.info(`Routes for update: ${JSON.stringify(routesToUpdate)}`);
                return Promise.resolve(routesToUpdate);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Send HTTP Request to GCP API (Compute)
     *
     * @returns {Promise} A promise which will be resolved upon complete response
     *
     */
    _sendRequest(method, path, body) {
        if (!this.accessToken) {
            return Promise.reject(new Error('httpUtil.sendRequest: no auth token. call init first'));
        }

        const headers = {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
        };

        /*
        // Debug remove when doen
        if (method == 'POST'){
            this.logger.info('DEBUG_API_PATH: ' + path);
            this.logger.info('DEBUG_API_BODY: ' + JSON.stringify(body));
            this.logger.info('DEBUG_API_HEADERS: ' + JSON.stringify(headers));
        }
        */
        const url = `${this.BASE_URL}/projects/${this.projectId}/${path}`;
        return httpUtil.request(method, url, { headers, body });
    }


    /**
     * Get local metadata for a specific entry
     *
     * @param {String} entry - The name of the metadata entry. For example 'instance/zone'
     *
     * @returns {Promise} A promise which is resolved with the metadata requested
     *
     */
    _getLocalMetadata(entry) {
        const options = {
            headers: {
                'Metadata-Flavor': 'Google'
            }
        };

        return cloudLibsUtil.getDataFromUrl(
            `http://metadata.google.internal/computeMetadata/v1/${entry}`,
            options
        )
            .then((data) => {
                this.logger.silly('Returning local metadata: ');
                return data;
            })
            .catch((err) => {
                const message = `Error getting local metadata ${err.message}`;
                return Promise.reject(new Error(message));
            });
    }


    /**
     * Get instance metadata from GCP
     *
     * @param {Object} vmName - Instance Name
     *
     * @returns {Promise} A promise which will be resolved with the metadata for the instance
     *
     */
    _getVmMetadata(vmName) {
        const vm = this.computeZone.vm(vmName);

        return vm.getMetadata()
            .then((data) => {
                const metadata = data[0];
                return Promise.resolve(metadata);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Get Instance Information from VM metadata
     *
     * @param {Object} vmName                   - Instance Name
     *
     * @param {Object} options                  - Options for function
     * @param {Array} options.failOnStatusCodes - Optionally provide a list of status codes to fail
     *                                              on, for example 'STOPPING'
     *
     * @returns {Promise} A promise which will be resolved with the metadata for the instance
     *
     */
    _getVmInfo(vmName, options) {
        const failOnStatusCodes = options && options.failOnStatusCodes ? options.failOnStatusCodes : [];
        return this._getVmMetadata(vmName)
            .then((data) => {
                if (failOnStatusCodes.length > 0) {
                    const vmStatus = data.status;
                    if (vmStatus && vmStatus.includes(failOnStatusCodes)) {
                        return Promise.reject(new Error('vm status is in failOnStatusCodes'));
                    }
                }
                return Promise.resolve(data);
            })
            .catch(err => Promise.reject(err));
    }


    /**
     * Updates Instance Network Interface
     *
     * @param {Object} vmId - Instance ID
     *
     * @param {Object} nicId - NIC ID (name)
     *
     * @param {Object} nicArr - Updated NIC properties
     *
     * @returns {Promise} A promise which will be resolved with the operation response
     *
     */
    _updateNic(vmId, nicId, nicArr) {
        this.logger.info(`Updating NIC: ${nicId} for VM: ${vmId}`);
        return this._sendRequest(
            'PATCH',
            `zones/${this.zone}/instances/${vmId}/updateNetworkInterface?networkInterface=${nicId}`,
            nicArr
        )
            .then((data) => {
                // updateNetworkInterface is async, returns GCP zone operation
                const operation = this.computeZone.operation(data.name);
                return operation.promise();
            })
            .then(data => Promise.resolve(data))
            .catch(err => Promise.reject(err));
    }


    /**
     * Updates forwarding rule target
     *
     * @param {Object} name - Fowarding rule name
     *
     * @param {Object} target - Fowarding rule target instance to set
     *
     * @returns {Promise} A promise which will be resolved with the operation response
     *
     */
    _updateFwdRule(name, target) {
        this.logger.info(`Updating forwarding rule: ${name} to target: ${target}`);
        const rule = this.computeRegion.rule(name);
        return rule.setTarget(target)
            .then((data) => {
                const operationName = data[0].name;
                this.logger.info(`updateFwdRule operation name: ${operationName}`);

                // returns GCP region operation, wait for that to complete
                const operation = this.computeRegion.operation(operationName);
                return operation.promise();
            })
            .then(data => Promise.resolve(data))
            .catch(err => Promise.reject(err));
    }


    /**
     * Get all VMs with a given tag (label)
     *
     * @param {Object} tag - Tag to search for. Tag should be in the format:
     *
     *                 {
     *                     key: key to search for
     *                     value: value to search for
     *                 }
     *
     * @returns {Promise} A promise which will be resolved with an array of instances
     *
     */
    _getVmsByTag(tag) {
        if (!tag) {
            return Promise.reject(new Error('getVmsByTag: no tag, load configuration file first'));
        }

        // Labels in GCP must be lower case
        const options = {
            filter: `labels.${tag.key.toLowerCase()} eq ${tag.value.toLowerCase()}`
        };
        return this.compute.getVMs(options)
            .then((vmsData) => {
                const computeVms = vmsData !== undefined ? vmsData : [[]];
                const promises = [];
                computeVms[0].forEach((vm) => {
                    // retry if vm is stopping as metadata fingerprint returned may change
                    promises.push(util.retrier.call(this, this._getVmInfo, [vm.name, { failOnStatusCodes: ['STOPPING'] }], { maxRetries: 1, retryIntervalMs: 100 }));
                });
                return Promise.all(promises);
            })
            .then(data => Promise.resolve(data))
            .catch(err => Promise.reject(err));
    }

    /**
     * Get all forwarding rules (non-global)
     *
     * @returns {Promise} A promise which will be resolved with an array of forwarding rules
     *
     */
    _getFwdRules() {
        // ideally could just call compute.getRules, but that is global only
        return this._sendRequest(
            'GET',
            `regions/${this.region}/forwardingRules`
        )
            .then(data => Promise.resolve(data))
            .catch(err => Promise.reject(err));
    }

    /**
     * Get all target instances
     *
     * @returns {Promise} A promise which will be resolved with an array of target instances
     *
     */
    _getTargetInstances() {
        // ideally could just call compute SDK, but not supported yet
        return this._sendRequest(
            'GET',
            `zones/${this.zone}/targetInstances`
        )
            .then(data => Promise.resolve(data))
            .catch(err => Promise.reject(err));
    }


    /**
     * Match IPs against a filter set of IPs
     *
     * @param {Object} ips - Array of IPs, support in .ipCidrRange
     *
     * @param {Object} ipsFilter - Array of filter IPs, support in .address
     *
     * @returns {Promise} A promise which will be resolved with the array of matched IPs
     *
     */
    _matchIps(ips, ipsFilter) {
        const matched = [];
        ips.forEach((ip) => {
            // Each IP should contain CIDR suffix
            let ipAddr = ip.ipCidrRange !== undefined ? ip.ipCidrRange : ip;
            ipAddr = ipAddr.indexOf('/') === -1 ? `${ipAddr}/32` : ipAddr;
            const ipAddrParsed = ipaddr.parseCIDR(ipAddr);
            let match = false;

            ipsFilter.forEach((ipFilter) => {
                // IP in filter array within range will constitute match
                let ipFilterAddr = ipFilter.address !== undefined ? ipFilter.address : ipFilter;
                ipFilterAddr = ipFilterAddr.split('/')[0];
                const ipFilterAddrParsed = ipaddr.parse(ipFilterAddr);
                if (ipFilterAddrParsed.match(ipAddrParsed)) {
                    match = true;
                }
            });
            // Add IP to matched array if a match was found
            if (match) {
                matched.push(ip);
            }
        });
        return matched;
    }

    /**
     * Determine what NICs to update, update any necessary
     *
     * @param {Object} vms - List of instances with properties
     *
     * @returns {Promise} A promise which will be resolved once update is complete
     *
     */
    _updateNics(localAddresses, failoverAddresses) {
        const myVms = [];
        const theirVms = [];
        const aliasIpsArr = [];
        const trafficGroupIpArr = failoverAddresses;
        const disassociateArr = [];
        const associateArr = [];

        // There should be at least one item in trafficGroupIpArr
        if (!trafficGroupIpArr.length) {
            this.logger.info('updateNics: No traffic group address(es) exist, skipping');
            return Promise.reject();
        }

        // Look through each VM and seperate us vs. them
        this.vms.forEach((vm) => {
            if (vm.name === this.instanceName) {
                myVms.push(vm);
            } else {
                theirVms.push(vm);
            }
        });

        // There should be one item in myVms
        if (!myVms.length) {
            const message = `Unable to locate our VM in the deployment: ${this.instanceName}`;
            this.logger.error(message);
            return Promise.reject(new Error(message));
        }

        theirVms.forEach((vm) => {
            this.logger.silly(`VM name: ${vm.name}`);
            vm.networkInterfaces.forEach((nic) => {
                const theirNic = nic;
                const theirAliasIps = theirNic.aliasIpRanges;
                if (theirAliasIps && theirAliasIps.length) {
                    const matchingAliasIps = this._matchIps(theirAliasIps, trafficGroupIpArr);
                    if (matchingAliasIps.length) {
                        // Track all alias IPs found for inclusion
                        aliasIpsArr.push({
                            vmName: vm.name,
                            nicName: nic.name,
                            aliasIpRanges: matchingAliasIps
                        });

                        // Yank alias IPs from their VM NIC properties, mark NIC for update
                        matchingAliasIps.forEach((myIp) => {
                            let i = 0;
                            theirAliasIps.forEach((theirIp) => {
                                if (myIp.ipCidrRange === theirIp.ipCidrRange) {
                                    theirAliasIps.splice(i, 1);
                                }
                                i += 1;
                            });
                        });

                        theirNic.aliasIpRanges = theirAliasIps;
                        disassociateArr.push([vm.name, nic.name, theirNic]);
                    }
                }
            });
        });

        // Look through alias IP array and add to active VM's matching NIC
        const myVm = [myVms[0]];
        myVm.forEach((vm) => {
            vm.networkInterfaces.forEach((nic) => {
                let match = false;
                const myNic = nic;
                myNic.aliasIpRanges = myNic.aliasIpRanges !== undefined ? myNic.aliasIpRanges : [];
                aliasIpsArr.forEach((ip) => {
                    if (nic.name === ip.nicName) {
                        match = true;
                        ip.aliasIpRanges.forEach((alias) => {
                            myNic.aliasIpRanges.push(alias);
                        });
                    }
                });
                if (match) {
                    associateArr.push([vm.name, myNic.name, myNic]);
                }
            });
        });
        // debug
        this.logger.silly('disassociateArr:', disassociateArr);
        this.logger.silly('associateArr:', associateArr);

        const disassociatePromises = [];
        disassociatePromises.push(util.retrier.call(this, this._updateNic, disassociateArr[0]));
        return Promise.all(disassociatePromises)
            .then(() => {
                this.logger.info('Disassociate NICs successful');
                const associatePromises = [];
                associatePromises.push(util.retrier.call(this, this._updateNic, associateArr[0]));
                return Promise.all(associatePromises);
            })
            .then(() => {
                this.logger.info('Associate NICs successful');
                return Promise.resolve();
            })
            .catch((error) => {
                this.logger.error('Error: ', error);
                return Promise.reject(error);
            });
    }

    /**
     * Determine what forwarding rules to update, update any necessary
     *
     * @param {Object} fwdRules - Object containing list of forwarding rules
     *
     * @param {Object} targetInstances - Object containing list of forwarding rules
     *
     * @returns {Promise} A promise which will be resolved once update is complete
     *
     */
    _updateFwdRules(fwdRules, targetInstances, failoverIpAddresses) {
        const rules = fwdRules.items;
        const trafficGroupIpArr = failoverIpAddresses;
        const fwdRulesToUpdate = [];
        const that = this;

        // There should be at least one item in trafficGroupIpArr
        if (!trafficGroupIpArr.length) {
            this.logger.info('updateFwdRules: No traffic group address(es) exist, skipping');
            return Promise.reject();
        }

        const getOurTargetInstance = function (tgtInstances) {
            const result = [];
            tgtInstances.forEach((tgt) => {
                const tgtInstance = tgt.instance.split('/');
                const tgtInstanceName = tgtInstance[tgtInstance.length - 1];
                // check for instance name in .instance where it is an exact match
                if (tgtInstanceName === that.instanceName) {
                    result.push({ name: tgt.name, selfLink: tgt.selfLink });
                }
            });
            return result;
        };

        const ourTargetInstances = getOurTargetInstance(targetInstances.items);
        // there should be one item in ourTargetInstances
        if (!ourTargetInstances.length) {
            const message = `Unable to locate our target instance: ${this.instanceName}`;
            this.logger.error(message);
            return Promise.reject(new Error(message));
        }
        const ourTargetInstance = ourTargetInstances[0];
        rules.forEach((rule) => {
            const match = this._matchIps([rule.IPAddress], trafficGroupIpArr);
            if (match.length) {
                this.logger.silly('updateFwdRules matched rule:', rule);

                if (!rule.target.indexOf(ourTargetInstance.name) > -1) {
                    fwdRulesToUpdate.push(rule.name);
                    fwdRulesToUpdate.push(ourTargetInstance.selfLink);
                }
            }
        });
        // debug
        this.logger.silly(`fwdRulesToUpdate: ${JSON.stringify(fwdRulesToUpdate, null, 1)}`);

        // longer retry interval to avoid 'resource is not ready' API response, can take 30+ seconds
        const retryIntervalMs = 60000;
        const promises = [];
        promises.push(util.retrier.call(this, this._updateFwdRule, fwdRulesToUpdate, { retryIntervalMs }));
        return Promise.all(promises)
            .then(() => {
                this.logger.info('Update forwarding rules successful');
                return Promise.resolve();
            })
            .catch((error) => {
                this.logger.error('Error: ', error);
                return Promise.reject(error);
            });
    }
}

module.exports = {
    Cloud
};
