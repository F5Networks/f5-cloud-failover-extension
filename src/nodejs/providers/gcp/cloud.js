/**
 * Copyright 2020 F5 Networks, Inc.
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
const { Storage } = require('@google-cloud/storage');
const cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;
const httpUtil = require('@f5devcentral/f5-cloud-libs').httpUtil;
const CLOUD_PROVIDERS = require('../../constants').CLOUD_PROVIDERS;
const INSPECT_ADDRESSES_AND_ROUTES = require('../../constants').INSPECT_ADDRESSES_AND_ROUTES;
const GCP_FWD_RULE_PAIR_LABEL = require('../../constants').GCP_FWD_RULE_PAIR_LABEL;
const storageContainerName = require('../../constants').STORAGE_FOLDER_NAME;
const GCP_LABEL_NAME = require('../../constants').GCP_LABEL_NAME;
const util = require('../../util.js');

const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;

const gcpLabelRegex = new RegExp(`${GCP_LABEL_NAME}=.*\\{.*\\}`, 'g');
const gcpLabelParse = (data) => {
    let ret = {};
    try {
        ret = JSON.parse(data.match(gcpLabelRegex)[0].split('=')[1]);
    } catch (err) {
        // continue
    }
    return ret;
};

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.GCP, options);
        this.BASE_URL = 'https://www.googleapis.com/compute/v1';
        this.compute = new Compute();
        this.storage = new Storage();
        this.bucket = null;
    }

    /**
    * See the parent class method for details
    */
    init(options) {
        super.init(options);

        return Promise.all([
            this._getLocalMetadata('project/project-id'),
            this._getLocalMetadata('instance/service-accounts/default/token'),
            this._getLocalMetadata('instance/name'),
            this._getLocalMetadata('instance/zone'),
            this._getBucketFromLabel(this.storageTags)
        ])
            .then((data) => {
                this.projectId = data[0];
                this.accessToken = data[1].access_token;
                this.instanceName = data[2];
                this.instanceZone = data[3];
                this.bucket = data[4];

                this.logger.silly(`deployment bucket name: ${this.bucket.name}`);

                this.zone = this._parseZone(this.instanceZone);
                this.computeZone = this.compute.zone(this.zone);
                this.region = this.zone.substring(0, this.zone.lastIndexOf('-'));
                this.computeRegion = this.compute.region(this.region);

                this.logger.silly('Getting GCP resources');
                return Promise.all([
                    this._getVmsByTags(this.tags),
                    this._getFwdRules(),
                    this._getTargetInstances()
                ]);
            })
            .then((vmsData) => {
                this.vms = vmsData[0] || [];
                this.fwdRules = vmsData[1] || [];
                this.targetInstances = vmsData[2] || [];
                this.logger.debug('Cloud provider found vms:', this.vms);
                this.logger.debug('Cloud provider found fwdRules:', this.fwdRules);
                this.logger.debug('Cloud provider found targetInstances:', this.targetInstances);
                this.logger.silly('Cloud Provider initialization complete');
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Upload data to storage (cloud)
     *
     * @param {Object} fileName - file name where data should be uploaded
     * @param {Object} data     - data to upload
     *
     * @returns {Promise}
     */
    uploadDataToStorage(fileName, data) {
        this.logger.silly(`Data will be uploaded to ${fileName}: `, data);

        const file = this.bucket.file(`${storageContainerName}/${fileName}`);
        return this._retrier(file.save, [util.stringify(data)], { thisArg: file })
            .catch(err => Promise.reject(err));
    }

    /**
     * Download data from storage (cloud)
     *
     * @param {Object} fileName - file name where data should be downloaded
     *
     * @returns {Promise}
     */
    downloadDataFromStorage(fileName) {
        const file = this.bucket.file(`${storageContainerName}/${fileName}`);
        return file.exists()
            .then((exists) => {
                if (!exists[0]) {
                    return Promise.resolve({});
                }
                const stream = file.createReadStream();
                let buffer = '';
                return new Promise((resolve, reject) => {
                    stream
                        .on('data', (data) => {
                            buffer += data;
                        });
                    stream
                        .on('error', (err) => {
                            reject(err);
                        });
                    stream
                        .on('end', () => {
                            resolve(JSON.parse(buffer));
                        });
                });
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Update Addresses
    *
    * @param {Object} options                     - function options
    * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
    * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
    * @param {Boolean} [options.discoverOnly]     - only perform discovery operation
    * @param {Object} [options.updateOperations]  - skip discovery and perform 'these' update operations
    *
    * @returns {Object}
    */
    updateAddresses(options) {
        options = options || {};
        const failoverAddresses = options.failoverAddresses || [];
        const discoverOnly = options.discoverOnly || false;
        const updateOperations = options.updateOperations;

        this.logger.silly('updateAddresses: ', options);

        // update this.vms property prior to discovery/update
        return this._getVmsByTags(this.tags)
            .then((vms) => {
                this.vms = vms || [];

                // discover only logic
                if (discoverOnly === true) {
                    return this._discoverAddressOperations(failoverAddresses);
                }
                // update only logic
                if (updateOperations) {
                    return this._updateAddresses(updateOperations);
                }
                // default - discover and update
                return this._discoverAddressOperations(failoverAddresses)
                    .then(operations => this._updateAddresses(operations));
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Update routes
    *
    * @param {Object} options                     - function options
    * @param {Object} [options.localAddresses]    - object containing 1+ local (self) addresses [ '192.0.2.1' ]
    * @param {Boolean} [options.discoverOnly]     - only perform discovery operation
    * @param {Boolean} [options.updateOperations] - skip discovery and perform 'these' update operations
    *
    * @returns {Promise}
    */
    updateRoutes(options) {
        options = options || {};
        const localAddresses = options.localAddresses || [];
        const discoverOnly = options.discoverOnly || false;
        const updateOperations = options.updateOperations;

        if (discoverOnly === true) {
            return this._discoverRouteOperations(localAddresses)
                .catch(err => Promise.reject(err));
        }
        if (updateOperations) {
            return this._updateRoutes(updateOperations.operations)
                .catch(err => Promise.reject(err));
        }
        // default - discover and update
        return this._discoverRouteOperations(localAddresses)
            .then(operations => this._updateRoutes(operations.operations))
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
            .then(data => Promise.resolve(data))
            .catch((err) => {
                const message = `Error getting local metadata ${err.message}`;
                return Promise.reject(new Error(message));
            });
    }

    /**
     * Get google storage bucket from given label
     *
     * Note: do not log all bucket information, it can be very large
     *
     * @param {Object} labels - The label name of a bucket. For example { f5_cloud_failover_label: 'x' }
     *
     * @returns {Promise} A promise which is resolved with the bucket requested
     *
     */
    _getBucketFromLabel(labels) {
        // helper function
        function getBucketLabels(bucket) {
            return bucket.getLabels()
                .then(bucketLabels => Promise.resolve({
                    name: bucket.name,
                    labels: bucketLabels,
                    bucketObject: bucket
                }))
                .catch(err => Promise.reject(err));
        }

        return this.storage.getBuckets()
            .then((data) => {
                const promises = [];
                data[0].forEach((bucket) => {
                    promises.push(getBucketLabels(bucket));
                });
                return Promise.all(promises);
            })
            .then((buckets) => {
                const labelKeys = Object.keys(labels);
                const filteredBuckets = buckets.filter((bucket) => {
                    this.logger.silly(
                        `bucket name: ${util.stringify(bucket.name)} bucket labels: ${util.stringify(bucket.labels)}`
                    );
                    let matchedTags = 0;
                    labelKeys.forEach((labelKey) => {
                        bucket.labels.forEach((bucketLabel) => {
                            if (Object.keys(bucketLabel).indexOf(labelKey) !== -1
                                && bucketLabel[labelKey] === labels[labelKey]) {
                                matchedTags += 1;
                            }
                        });
                    });
                    return labelKeys.length === matchedTags;
                });
                if (!filteredBuckets || filteredBuckets.length === 0) {
                    return Promise.reject(new Error(`Filtered bucket does not exist: ${filteredBuckets}`));
                }
                return Promise.resolve(filteredBuckets[0].bucketObject); // there should only be one
            });
    }

    /**
     * Get instance metadata from GCP
     *
     * @param {Object} vmName         - instance name
     *
     * @param {Object} options        - function options
     * @param {String} [options.zone] - instance zone
     *
     * @returns {Promise} A promise which will be resolved with the metadata for the instance
     *
     */
    _getVmMetadata(vmName, options) {
        options = options || {};

        const zone = options.zone || this.zone;
        const computeZone = this.compute.zone(zone);
        const vm = computeZone.vm(vmName);

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
     * @param {Object} vmName                     - Instance Name
     *
     * @param {Object} options                    - Options for function
     * @param {Array} [options.failOnStatusCodes] - Optionally provide a list of status codes to fail
     *                                              on, for example 'STOPPING'
     * @param {String} [options.zone]             - instance zone
     *
     * @returns {Promise} A promise which will be resolved with the metadata for the instance
     *
     */
    _getVmInfo(vmName, options) {
        options = options || {};
        const failOnStatusCodes = options.failOnStatusCodes || [];
        const zone = options.zone || this.zone;

        return this._getVmMetadata(vmName, { zone })
            .then((data) => {
                if (failOnStatusCodes.length > 0) {
                    const vmStatus = data.status;
                    if (vmStatus && vmStatus.includes(failOnStatusCodes)) {
                        return Promise.reject(new Error('VM status is in failOnStatusCodes'));
                    }
                }
                return Promise.resolve(data);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Get all VMs with a given tags (labels)
     *
     * @param {Object} tags - Tags to search for. Tags should be in the format:
     *
     *
     *                 {
     *                     key01: value01,
     *                     key02: value02
     *                 }
     *
     * @returns {Promise} A promise which will be resolved with an array of instances
     *
     */
    _getVmsByTags(tags) {
        if (!tags) {
            return Promise.reject(new Error('getVmsByTags: no tag, load configuration file first'));
        }
        const options = {};
        options.filter = [];

        Object.keys(tags).forEach((tagKey) => {
            // Labels in GCP must be lower case
            options.filter.push(`labels.${tagKey.toLowerCase()} eq ${tags[tagKey].toLowerCase()}`);
        });
        return this.compute.getVMs(options)
            .then((vmsData) => {
                const computeVms = vmsData !== undefined ? vmsData : [[]];
                const promises = [];
                computeVms[0].forEach((vm) => {
                    promises.push(this._retrier(
                        this._getVmInfo,
                        [vm.name, { zone: this._parseZone(vm.metadata.zone), failOnStatusCodes: ['STOPPING'] }]
                    ));
                });
                return Promise.all(promises);
            })
            .catch(err => Promise.reject(err));
    }


    /**
     * Get all forwarding rules (non-global)
     *
     * @returns {Promise} A promise which will be resolved with an array of forwarding rules
     *
     */
    _getFwdRules() {
        return this._sendRequest(
            'GET',
            `regions/${this.region}/forwardingRules`
        )
            .then(data => Promise.resolve(data.items))
            .catch(err => Promise.reject(err));
    }

    /**
     * Get all target instances
     *
     * @returns {Promise} A promise which will be resolved with an array of target instances
     *
     */
    _getTargetInstances() {
        return this._sendRequest(
            'GET',
            `zones/${this.zone}/targetInstances`
        )
            .then(data => Promise.resolve(data.items))
            .catch(err => Promise.reject(err));
    }

    /**
     * Parse zone - parse zone out of a provider object
     *
     * @returns {String} The parsed zone
     *
     */
    _parseZone(zoneProperty) {
        // known zone formats
        // - 'projects/1111/zones/us-west1-a'
        // - 'https://www.googleapis.com/compute/v1/projects/1111/zones/us-west1-a'
        const parts = zoneProperty.split('/');
        return parts[parts.length - 1];
    }

    /**
     * Returns routes objects used for failover; method uses routes' description values
     * to identify route objects to work with
     *
     * @param {Object} options        - function options
     * @param {Object} [options.tags] - object containing 1+ tags to filter on { 'key': 'value' }
     *
     * @returns {Promise} A promise which will provide list of routes which need to be updated
     *
     */
    _getRoutes(options) {
        options = options || {};
        const tags = options.tags || {};

        return this._sendRequest(
            'GET',
            'global/routes'
        )
            .then((routesList) => {
                const ourRoutes = routesList.items.filter((item) => {
                    const itemTags = gcpLabelParse(item.description);

                    let matchedTags = 0;
                    const tagKeys = Object.keys(tags);
                    tagKeys.forEach((key) => {
                        if (Object.keys(itemTags).indexOf(key) !== -1 && itemTags[key] === tags[key]) {
                            matchedTags += 1;
                        }
                    });
                    return tagKeys.length === matchedTags;
                });
                return Promise.resolve(ourRoutes);
            })
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
            let match = false;

            // Each IP should contain CIDR suffix
            let ipAddr = ip && ip.ipCidrRange !== undefined ? ip.ipCidrRange : ip;
            ipAddr = ipAddr.indexOf('/') === -1 ? `${ipAddr}/32` : ipAddr;
            const ipAddrParsed = ipaddr.parse(ipAddr.split('/')[0]);
            const ipAddrParsedCidr = ipaddr.parseCIDR(ipAddr);

            ipsFilter.forEach((ipFilter) => {
                // IP in filter array within range will constitute match
                let ipFilterAddr = ipFilter.address !== undefined ? ipFilter.address : ipFilter;
                ipFilterAddr = ipFilterAddr.split('/')[0];
                const ipFilterAddrParsed = ipaddr.parse(ipFilterAddr);
                if (ipAddrParsed.kind() === ipFilterAddrParsed.kind() && ipFilterAddrParsed.match(ipAddrParsedCidr)) {
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
     * Get the addresses and routes for inspect endpoint
     *
     * @returns {Promise} A promise which will be resolved with the array of Big-IP addresses and routes
     */
    getAssociatedAddressAndRouteInfo() {
        const data = util.deepCopy(INSPECT_ADDRESSES_AND_ROUTES);
        data.instance = this.instanceName;
        return Promise.all([
            this._getVmsByTags(this.tags),
            this._getRoutes({ tags: this.routeTags })
        ])
            .then((result) => {
                const privateIps = [];
                result[0].forEach((vm) => {
                    vm.networkInterfaces.forEach((address) => {
                        if (vm.name === this.instanceName) {
                            let vmPublicIp = null;
                            if (address.accessConfigs) {
                                vmPublicIp = address.accessConfigs[0].natIP;
                            }
                            privateIps.push(address.networkIP);
                            data.addresses.push({
                                publicIpAddress: vmPublicIp,
                                privateIpAddress: address.networkIP,
                                networkInterfaceId: address.name
                            });
                        }
                    });
                });
                result[1].forEach((route) => {
                    // only show route if the Big-IP instance is active
                    // by matching the nextHopIp with privateIps of active Big-IP
                    if (privateIps.includes(route.nextHopIp)) {
                        data.routes.push({
                            routeTableId: route.id,
                            routeTableName: route.name,
                            networkId: route.network
                        });
                    }
                });
                return Promise.resolve(data);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Discover address operations
     *
     * @param {Object} failoverAddresses - failover addresses
     *
     * @returns {Promise} { publicAddresses: [], interfaces: [], loadBalancerAddresses: [] }
     *
     */
    _discoverAddressOperations(failoverAddresses) {
        this.logger.debug('Failover addresses to discover', failoverAddresses);
        if (!failoverAddresses || !failoverAddresses.length) {
            this.logger.debug('No failoverAddresses to discover');
            return Promise.resolve({
                publicAddresses: [],
                interfaces: [],
                loadBalancerAddresses: []
            });
        }

        return Promise.all([
            this._discoverNicOperations(failoverAddresses),
            this._discoverFwdRuleOperations(failoverAddresses)
        ])
            .then(operations => Promise.resolve({
                publicAddresses: {},
                interfaces: operations[0],
                loadBalancerAddresses: operations[1]
            }))
            .catch(err => Promise.reject(err));
    }

    /**
     * Discover nic (alias ip, etc.) operations
     *
     * @param {Object} failoverAddresses - failover addresses
     *
     * @returns {Promise} A promise which will be resolved once update is complete
     *
     */
    _discoverNicOperations(failoverAddresses) {
        const myVms = [];
        const theirVms = [];
        const aliasIpsArr = [];
        const disassociate = [];
        const associate = [];

        // There should be at least one item in trafficGroupIpArr
        if (!failoverAddresses || !failoverAddresses.length) {
            this.logger.silly('No traffic group address(es) exist, skipping');
            return Promise.resolve({ disassociate, associate });
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
                    const matchingAliasIps = this._matchIps(theirAliasIps, failoverAddresses);
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
                        disassociate.push([vm.name, nic.name, theirNic, { zone: this._parseZone(vm.zone) }]);
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
                    associate.push([vm.name, myNic.name, myNic, { zone: this._parseZone(vm.zone) }]);
                }
            });
        });
        return Promise.resolve({ disassociate, associate });
    }

    /**
     * Discover what forwarding rules to update
     *
     * @param {Object} failoverAddresses - failover addresses
     *
     * @returns {Promise} A promise which will be resolved once discovery is complete
     *
     */
    _discoverFwdRuleOperations(failoverAddresses) {
        const fwdRulesToUpdate = [];

        const getOurTargetInstance = (instanceName, tgtInstances) => {
            const result = [];

            tgtInstances.forEach((tgt) => {
                const tgtInstance = tgt.instance.split('/');
                const tgtInstanceName = tgtInstance[tgtInstance.length - 1];
                // check for instance name in .instance where it is an exact match
                if (tgtInstanceName === instanceName) {
                    result.push({ name: tgt.name, selfLink: tgt.selfLink });
                }
            });

            if (!tgtInstances.length) {
                return Promise.reject(
                    new Error(`Unable to locate our target instance: ${this.instanceName}`)
                );
            }
            return result[0];
        };

        return Promise.all([
            this._getFwdRules(),
            this._getTargetInstances()
        ])
            .then((data) => {
                this.fwdRules = data[0] || [];
                this.targetInstances = data[1] || [];

                this.fwdRules.forEach((rule) => {
                    const match = this._matchIps([rule.IPAddress], failoverAddresses);
                    if (!match.length) {
                        return; // continue with next iteration
                    }

                    this.logger.silly('updateFwdRules matched rule:', rule);

                    let targetInstanceToUse = getOurTargetInstance(this.instanceName, this.targetInstances);
                    // the target instance to use may also be provided on the fwd rules object
                    // itself, check there if necessary
                    const fwdRuleDefinedTargetInstances = this._getFwdRulesTargetInstancesFromLabel(rule);
                    if (fwdRuleDefinedTargetInstances) {
                        targetInstanceToUse = getOurTargetInstance(
                            this.instanceName, fwdRuleDefinedTargetInstances
                        );
                    }
                    this.logger.silly('Discovered our target instance ', targetInstanceToUse);

                    if (rule.target && rule.target.indexOf(targetInstanceToUse.name) === -1) {
                        fwdRulesToUpdate.push([rule.name, targetInstanceToUse.selfLink]);
                    }
                });
                this.logger.silly('fwdRulesToUpdate: ', fwdRulesToUpdate);

                return Promise.resolve({ operations: fwdRulesToUpdate });
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Discover route operations
    *
    * @param {Object} localAddresses - local addresses
    *
    * @returns {Promise} { operations: [] }
    */
    _discoverRouteOperations(localAddresses) {
        localAddresses = localAddresses || [];
        const operations = [];
        return this._getRoutes({ tags: this.routeTags })
            .then((routes) => {
                this.logger.silly('Discovered routes: ', routes);
                routes.forEach((route) => {
                    const matchedAddressRange = this._matchRouteToAddressRange(route.destRange);
                    if (matchedAddressRange) {
                        const nextHopAddress = this._discoverNextHopAddress(
                            localAddresses,
                            gcpLabelParse(route.description),
                            matchedAddressRange.routeNextHopAddresses
                        );
                        // check if route should be updated and if next hop is our address,
                        // if not we need to update it
                        if (nextHopAddress && route.nextHopIp !== nextHopAddress) {
                            this.logger.silly('Route to be updated', route);
                            route.nextHopIp = nextHopAddress;
                            operations.push(route);
                        }
                    }
                });
                return Promise.resolve({ operations });
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Update addresses (given NIC and/or fwdRule operations)
    *
    * @param {Object} options            - function options
    * @param {Object} [options.interfaces]     - interfaces for nic operations
    * @param {Object} [options.loadBalancerAddresses] - load balancer addresses for forwarding rule operations
    *
    * @returns {Promise}
    */
    _updateAddresses(options) {
        options = options || {};
        const nicOperations = options.interfaces || {};
        const fwdRuleOperations = options.loadBalancerAddresses || {};

        if (!options || Object.keys(options).length === 0) {
            this.logger.info('No address operations to run');
            return Promise.resolve();
        }
        this.logger.silly('_updateAddresses interface operations: ', nicOperations);
        this.logger.silly('_updateAddresses forwarding rules operations: ', fwdRuleOperations);
        return Promise.all([
            this._updateNics(nicOperations.disassociate, nicOperations.associate),
            this._updateFwdRules(fwdRuleOperations.operations)
        ])
            .catch(err => Promise.reject(err));
    }

    /**
    * Update nics (given disassociate/associate operations)
    *
    * @param {Array} disassociate - Disassociate array
    * @param {Array} associate    - Associate array
    *
    * @returns {Promise}
    */
    _updateNics(disassociate, associate) {
        this.logger.silly('updateAddresses disassociate operations: ', disassociate);
        this.logger.silly('updateAddresses associate operations: ', associate);

        if (!disassociate || !associate) {
            this.logger.info('No associations to update.');
            return Promise.resolve([]);
        }

        const disassociatePromises = [];
        disassociate.forEach((item) => {
            disassociatePromises.push(this._retrier(this._updateNic, item));
        });
        return Promise.all(disassociatePromises)
            .then(() => {
                this.logger.info('Disassociate NICs successful.');

                const associatePromises = [];
                associate.forEach((item) => {
                    associatePromises.push(this._retrier(this._updateNic, item));
                });
                return Promise.all(associatePromises);
            })
            .then(() => {
                this.logger.info('Associate NICs successful.');
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Update forwarding rules (given reassociate operations)
     *
     * @param {Array} operations - operations array
     *
     * @returns {Promise} A promise which will be resolved once update is complete
     *
     */
    _updateFwdRules(operations) {
        const promises = [];
        operations.forEach((item) => {
            promises.push(this._retrier(this._updateFwdRule, item));
        });
        return Promise.all(promises)
            .then(() => {
                this.logger.info('Updated forwarding rules successfully');
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Update routes (given reassociate operations)
    *
    * @param {Array} operations - operations array
    *
    * @returns {Promise}
    */
    _updateRoutes(operations) {
        this.logger.debug('updateRoutes operations: ', operations);

        if (!operations || !operations.length) {
            this.logger.info('No route operations to run');
            return Promise.resolve();
        }

        // update routes is not supported in GCP, so delete and recreate
        const deletePromises = [];
        operations.forEach((item) => {
            const uri = `global/routes/${item.id}`;
            // delete necessary properties first
            delete item.id;
            delete item.creationTimestamp;
            delete item.kind;
            delete item.selfLink;
            // now, delete
            deletePromises.push(this._sendRequest('DELETE', uri));
        });

        return Promise.all(deletePromises)
            .then((response) => {
                this.logger.debug('Deleted routes successfully');
                const operationPromises = [];
                response.forEach((item) => {
                    const operation = this.compute.operation(item.name);
                    operationPromises.push(operation.promise());
                });
                return Promise.all(operationPromises);
            })
            .then(() => {
                const createPromises = [];
                operations.forEach((item) => {
                    createPromises.push(this._sendRequest('POST', 'global/routes/', item));
                });
                return Promise.all(createPromises);
            })
            .then(() => {
                this.logger.info('Updated routes successfully');
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Updates Instance Network Interface
     *
     * @param {Object} vmId           - Instance ID
     * @param {Object} nicId          - NIC ID (name)
     * @param {Object} nicArr         - Updated NIC properties
     *
     * @param {Object} options        - function options
     * @param {Object} [options.zone] - override default zone
     *
     * @returns {Promise} A promise which will be resolved with the operation response
     *
     */
    _updateNic(vmId, nicId, nicArr, options) {
        options = options || {};
        const zone = options.zone || this.zone;

        this.logger.silly(`Updating NIC: ${nicId} for VM ${vmId} in zone ${zone}`);
        return this._sendRequest(
            'PATCH',
            `zones/${zone}/instances/${vmId}/updateNetworkInterface?networkInterface=${nicId}`,
            nicArr
        )
            .then((data) => {
                // updateNetworkInterface is async, returns GCP zone operation
                const computeZone = this.compute.zone(zone);
                const operation = computeZone.operation(data.name);
                return operation.promise();
            })
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
        this.logger.silly(`Updating forwarding rule: ${name} to target: ${target}`);
        const rule = this.computeRegion.rule(name);
        return rule.setTarget(target)
            .then((data) => {
                const operationName = data[0].name;
                this.logger.silly(`updateFwdRule operation name: ${operationName}`);

                // returns GCP region operation, wait for that to complete
                const operation = this.computeRegion.operation(operationName);
                return operation.promise();
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Finds target pair label on forwarding rule and returns the target
     * instances that match the target pair names
     *
     * @param rule               - Forwarding rule
     * @return {null|Array}      - Array of target instances
     * @private
     */

    _getFwdRulesTargetInstancesFromLabel(rule) {
        const targetInstanceNames = gcpLabelParse(rule.description)[GCP_FWD_RULE_PAIR_LABEL];
        if (targetInstanceNames) {
            return this.targetInstances.filter(
                targetInstance => targetInstanceNames.split(/[ ,]+/).indexOf(targetInstance.name) !== -1
            );
        }
        return null;
    }
}

module.exports = {
    Cloud
};
