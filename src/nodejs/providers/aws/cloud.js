/**
 * Copyright 2021 F5 Networks, Inc.
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

const AWS = require('aws-sdk');
const IPAddressLib = require('ip-address');
const PROXY = require('https-proxy-agent');
const CLOUD_PROVIDERS = require('../../constants').CLOUD_PROVIDERS;
const INSPECT_ADDRESSES_AND_ROUTES = require('../../constants').INSPECT_ADDRESSES_AND_ROUTES;
const util = require('../../util');
const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;
const constants = require('../../constants');


class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AWS, options);

        this.metadata = new AWS.MetadataService();
        this.s3 = {};
        this.s3FilePrefix = constants.STORAGE_FOLDER_NAME;
        this.ec2 = {};
    }

    /**
    * See the parent class method for details
    */
    init(options) {
        super.init(options);

        return this._getInstanceIdentityDoc()
            .then((metadata) => {
                this.region = metadata.region;
                this.instanceId = metadata.instanceId;
                this.customerId = metadata.accountId;
                const config = {
                    region: this.region
                };
                if (this.proxySettings) {
                    config.httpOptions = { agent: new PROXY(this._formatProxyUrl(this.proxySettings)) };
                }
                AWS.config.update(config);
                this.ec2 = new AWS.EC2();
                this.s3 = new AWS.S3();

                if (this.storageName) {
                    return this.storageName;
                }
                return this._getS3BucketByTags(this.storageTags);
            })
            .then((bucketName) => {
                this.s3BucketName = bucketName;
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
        const s3Key = `${this.s3FilePrefix}/${fileName}`;
        this.logger.silly(`Uploading data to: ${s3Key}`);

        const uploadObject = () => new Promise((resolve, reject) => {
            const params = {
                Body: util.stringify(data),
                Bucket: this.s3BucketName,
                Key: s3Key
            };
            this.s3.putObject(params).promise()
                .then(() => resolve())
                .catch(err => reject(err));
        });

        return this._retrier(uploadObject, []);
    }

    /**
    * Download data from storage (cloud)
    *
    * @param {Object} fileName - file name where data should be downloaded
    *
    * @returns {Promise}
    */
    downloadDataFromStorage(fileName) {
        const s3Key = `${this.s3FilePrefix}/${fileName}`;
        this.logger.silly(`Downloading data from: ${s3Key}`);
        const downloadObject = () => new Promise((resolve, reject) => {
            // check if the object exists first, if not return an empty object
            this.s3.listObjectsV2({ Bucket: this.s3BucketName, Prefix: s3Key }).promise()
                .then((data) => {
                    if (data.Contents && data.Contents.length) {
                        return this.s3.getObject({ Bucket: this.s3BucketName, Key: s3Key }).promise()
                            .then(response => JSON.parse(response.Body.toString()));
                    }
                    return Promise.resolve({});
                })
                .then(response => resolve(response))
                .catch(err => reject(err));
        });

        return this._retrier(downloadObject, []);
    }

    /**
    * Update Addresses - Updates the public ip(s) on the BIG-IP Cluster, by re-associating Elastic IP Addresses
    *
    * @param {Object} options                     - function options
    * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
    * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
    * @param {Object} [options.updateOperations]  - skip discovery and perform 'these' update operations
    *
    * @returns {Object}
    */
    updateAddresses(options) {
        options = options || {};
        const localAddresses = options.localAddresses || [];
        const failoverAddresses = options.failoverAddresses || [];
        const updateOperations = options.updateOperations;

        this.logger.silly('updateAddresses: ', options);

        // update only logic
        if (updateOperations) {
            return this._updateAddresses(updateOperations)
                .catch(err => Promise.reject(err));
        }
        // default - discover and update
        return this._discoverAddressOperations(localAddresses, failoverAddresses)
            .then(operations => this._updateAddresses(operations))
            .catch(err => Promise.reject(err));
    }

    /**
     * Discover Addresses - discovers addresses
     *
     * @param {Object} options                     - function options
     * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
     * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
     *
     * @returns {Object}
     */
    discoverAddresses(options) {
        options = options || {};
        const localAddresses = options.localAddresses || [];
        const failoverAddresses = options.failoverAddresses || [];
        this.logger.silly('discoverAddresses: ', options);
        return this._discoverAddressOperations(localAddresses, failoverAddresses)
            .catch(err => Promise.reject(err));
    }

    /**
     * Discover addresses using provided definitions
     *
     * @param {Object}                         - local addresses, failover addresses
     * @param {Object} addressGroupDefinitions - provides definition used for fetching addresses from AWS cloud
     * @param {Object} options                 - function options
     *
     * @returns {Object} updateActions
     */
    discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options) {
        this.logger.silly(`discoverAddressOperationsUsingDefinitions: addresses: ${JSON.stringify(addresses)}`);
        this.logger.silly(`discoverAddressOperationsUsingDefinitions: addressGroupDefinitions: ${JSON.stringify(addressGroupDefinitions)}`);
        this.logger.silly(`discoverAddressOperationsUsingDefinitions: options: ${JSON.stringify(options)}`);
        const resultAction = {
            publicAddresses: {},
            interfaces: {
                disassociate: [],
                associate: []
            },
            loadBalancerAddresses: {}
        };
        const promises = [];
        addressGroupDefinitions.forEach((item) => {
            this.logger.silly(`aws-discoverAddressOperationsUsingDefinitions: handling addressGroupDefinition for elasticIpAddress ${item.type}`);
            if (item.type === 'elasticIpAddress') {
                promises.push(this._createActionForElasticIpAddress(resultAction, item));
            } else if (item.type === 'networkInterfaceAddress') {
                promises.push(this._createActionForAddressAssociationDisassociation(addresses, item));
            }
        });

        return Promise.all(promises)
            .then(response => response.pop())
            .catch(err => Promise.reject(err));
    }

    /**
     * Create operations for Elastic IP Address
     *
     * @param {Object} resultAction     - publicAddresses operations
     * @param {Object} providedAddress  - virtual addresses and scoping address
     *
     * @returns {Object} updateActions  - A promise resolved resultAction or rejects
     */
    _createActionForElasticIpAddress(resultAction, providedAddress) {
        if (providedAddress.vipAddresses === undefined || providedAddress.vipAddresses.length !== 2) {
            this.logger.silly('Provided address group definition does not provide correct number of vip addresses; 2 vip addreses must be provided.');
            return Promise.resolve(resultAction);
        }
        let publicIpAddress;
        return this._getElasticIPs({ publicAddress: providedAddress.scopingAddress })
            .then((response) => {
                if (!response) {
                    this.logger.warning('Elastic ip was not found. Make sure declaration provides correct public ip');
                    return Promise.resolve(resultAction);
                }

                if (response.Addresses === undefined || response.Addresses.length === 0) {
                    this.logger.warning('Response does not have addresses. Make sure declaration provides correct public ip under failoverAddresses.addressGroupDefinitions.');
                    return Promise.resolve(resultAction);
                }

                publicIpAddress = response.Addresses[0].PublicIp;
                let params = {
                    Filters: []
                };

                if (response.Addresses[0].PrivateIpAddress === undefined) {
                    this.logger.warning(`Recieved address does not have PrivateAddress association: ${util.stringify(response.Addresses[0])}`);
                    return Promise.resolve(resultAction);
                }

                if (providedAddress.vipAddresses.indexOf(response.Addresses[0].PrivateIpAddress) === -1) {
                    this.logger.warning('Private addresses associated with public ip is not in provided list of VIP Addresses. Make sure declaration includes correct VIP addresses under failoverAddresses.addressGroupDefinitions.');
                    return Promise.resolve(resultAction);
                }
                providedAddress.vipAddresses.forEach((privateAddress) => {
                    if (privateAddress !== response.Addresses[0].PrivateIpAddress) {
                        resultAction.publicAddresses[publicIpAddress] = {
                            current: {
                                PrivateIpAddress: response.Addresses[0].PrivateIpAddress,
                                AssociationId: response.Addresses[0].AssociationId
                            },
                            target: {
                                PrivateIpAddress: privateAddress,
                                NetworkInterfaceId: 'to-set'
                            },
                            AllocationId: response.Addresses[0].AllocationId
                        };
                        params = this._addFilterToParams(params, 'addresses.private-ip-address', privateAddress);
                        Object.keys(this.addressTags).forEach((tagKey) => {
                            params = this._addFilterToParams(params, `tag:${tagKey}`, this.addressTags[tagKey]);
                        });
                    }
                });
                return this._describeNetworkInterfaces(params);
            })
            .then((response) => {
                if (response.NetworkInterfaces === undefined || response.NetworkInterfaces.length !== 1) {
                    this.logger.warning('Problem with fetching network interface metadata. Make sure declaration includes correct VIP addresses under failoverAddresses.addressGroupDefinitions as well as network intefaces are tagged correctly.');
                    return Promise.resolve(resultAction);
                }
                resultAction.publicAddresses[publicIpAddress]
                    .target.NetworkInterfaceId = response.NetworkInterfaces[0].NetworkInterfaceId;
                return Promise.resolve(resultAction);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Create operations for associate and dissassociate address
     *
     * @param {Object} addresses        - local addresses, virtual addresses
     * @param {Object} providedAddress  - network interface scoping address
     *
     * @returns {Object}                - A promise resolved publicAddresses and interfaces
     */
    _createActionForAddressAssociationDisassociation(addresses, providedAddress) {
        const operations = {
            disassociate: [],
            associate: []
        };
        return Promise.all([
            this._getElasticIPs({ publicAddress: providedAddress.scopingAddress }),
            this._listNics({ tags: this.addressTags })
        ])
            .then((results) => {
                const eips = results[0].Addresses;
                const nics = results[1];
                this.logger.debug('Discover address operations found Elastic IPs:', eips);
                this.logger.debug('Discover address operations found Nics', nics);
                const parsedNics = this._parseNics(nics, addresses.localAddresses, addresses.failoverAddresses);
                this.logger.debug('_discoverAddressOperations parsed nics ', parsedNics);
                if (parsedNics.mine.length !== 1 || parsedNics.theirs.length !== 1) {
                    this.logger.warning(`Problem with discovering network interfaces; nics: ${JSON.stringify(parsedNics)}`);
                    return Promise.resolve({
                        publicAddresses: {},
                        interfaces: operations,
                        loadBalancerAddresses: {}
                    });
                }
                const nicOperations = this._checkForNicOperations(
                    parsedNics.mine[0].nic,
                    parsedNics.theirs[0].nic,
                    addresses.failoverAddresses
                );

                if (nicOperations.disassociate && nicOperations.associate) {
                    operations.disassociate.push(nicOperations.disassociate);
                    operations.associate.push(nicOperations.associate);
                }
                return Promise.resolve({
                    publicAddresses: {},
                    interfaces: operations,
                    loadBalancerAddresses: {}
                });
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Get Associated Address and Route Info - Returns associated and route table information
     *
     * @returns {Object}
     */
    getAssociatedAddressAndRouteInfo() {
        const data = util.deepCopy(INSPECT_ADDRESSES_AND_ROUTES);
        data.instance = this.instanceId;
        return Promise.all([
            this._getElasticIPs({ instanceId: this.instanceId }),
            this._getRouteTables({ instanceId: this.instanceId })
        ])
            .then((result) => {
                result[0].Addresses.forEach((address) => {
                    data.addresses.push({
                        publicIpAddress: address.PublicIp,
                        privateIpAddress: address.PrivateIpAddress,
                        networkInterfaceId: address.NetworkInterfaceId
                    });
                });
                result[1].forEach((route) => {
                    data.routes.push({
                        routeTableId: route.RouteTableId,
                        routeTableName: null, // add routeTableName here to normalize response across clouds
                        networkId: route.VpcId
                    });
                });
                return Promise.resolve(data);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Add filter to parameters
     *
     * @param {Object} params      - parameters object
     * @param {String} filterName  - name to filter on
     * @param {String} filterValue - value to filter on
     *
     * @returns {Object} - Modified parameters object
     */
    _addFilterToParams(params, filterName, filterValue) {
        params = params || {};

        if (!params.Filters) {
            params.Filters = [];
        }
        if (Array.isArray(filterValue)) {
            params.Filters.push(
                {
                    Name: filterName,
                    Values: filterValue
                }
            );
        } else {
            params.Filters.push(
                {
                    Name: filterName,
                    Values: [
                        filterValue
                    ]
                }
            );
        }

        return params;
    }

    /**
    * Discover address operations, supports multiple topologies
    *
    * Topology differences:
    * - Same Network: Assumes a private address should be moved, along with any
    * cooresponding public address (since the private address "floats" between NICs)
    * - Across Network: Assumes a public address should be reassociated to a different
    * private address (since the NICs are in different networks)
    *
    * @param {Object} localAddresses    - local addresses
    * @param {Object} failoverAddresses - failover addresses
    *
    * @returns {Promise} resolved with a list of update operations
    *                   {
    *                       'publicAddresses': {
    *                           'x.x.x.x': {
    *                               'current': {
    *                                   'PrivateIpAddress': 'x.x.x.x',
    *                                   'AssociationId': 'id'
    *                               },
    *                               'target': {
    *                                   'PrivateIpAddress': 'x.x.x.x',
    *                                   'NetworkInterfaceId': 'id'
    *                               },
    *                               'AllocationId': eip.AllocationId
    *                           }
    *                       },
    *                       'interfaces': {
    *                           "disassociate": [
    *                               {
    *                                   'addresses': [],
    *                                   'networkInterfaceId': 'id'
    *                               }
    *                           ],
    *                           "associate": [
    *                               {
    *                                   'addresses': [],
    *                                   'networkInterfaceId': 'id'
    *                               }
    *                           ]
    *                   }
    */
    _discoverAddressOperations(localAddresses, failoverAddresses) {
        return Promise.all([
            this._getElasticIPs({ tags: this.addressTags }),
            this._getPrivateSecondaryIPs(),
            this._listNics({ tags: this.addressTags })
        ])
            .then((results) => {
                const eips = results[0].Addresses;
                const secondaryPrivateIps = results[1];
                const nics = results[2];
                this.logger.debug('Discover address operations found Elastic IPs:', eips);
                this.logger.debug('Discover address operations found Private Secondary IPs', secondaryPrivateIps);
                this.logger.debug('Discover address operations found Nics', nics);
                const parsedNics = this._parseNics(nics, localAddresses, failoverAddresses);
                this.logger.debug('_discoverAddressOperations parsed nics ', parsedNics);

                return Promise.all([
                    this._generatePublicAddressOperations(eips, secondaryPrivateIps),
                    this._generateAddressOperations(localAddresses,
                        failoverAddresses, parsedNics)
                ]);
            })
            .then(operations => Promise.resolve({
                publicAddresses: operations[0],
                interfaces: operations[1],
                loadBalancerAddresses: {}
            }))
            .catch(err => Promise.reject(err));
    }

    /**
    * Update addresses - given reassociate operation(s)
    *
    * @param {Object} operations - operations object { publicAddresses: {}, interfaces: [] }
    *
    * @returns {Promise}
    */
    _updateAddresses(operations) {
        if (!operations || !Object.keys(operations).length) {
            this.logger.debug('No update address operations to perform');
            return Promise.resolve();
        }
        this.logger.debug('Update address operations to perform', operations);
        return Promise.all([
            this._reassociatePublicAddresses(operations.publicAddresses),
            this._reassociateAddresses(operations.interfaces)
        ])
            .then(() => {
                this.logger.info('Addresses reassociated successfully');
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Resolve CIDR block - whether IPv4 or IPv6
    *
    * @param {Object} route - provider route object
    *
    * @returns {Object} { cidrBlock: '192.0.2.0/24', ipVersion: '4' }
    */
    _resolveRouteCidrBlock(route) {
        // default to IPv4
        let ipVersion = '4';
        let cidrBlock = route.DestinationCidrBlock;

        // check if this route is using IPv6
        if (route.DestinationIpv6CidrBlock) {
            cidrBlock = route.DestinationIpv6CidrBlock;
            ipVersion = '6';
        }

        return { cidrBlock, ipVersion };
    }

    /**
    * Discover route operations
    *
    * @param {Array} localAddresses - array containing local (self) addresses [ '192.0.2.1' ]
    * @param {Object} routeGroup    - object containing group properties
    * @param {Array} routeTables    - array of route tables
    *
    * @returns {Promise} [ { routeTable: {}, networkInterfaceId: 'foo' }]
    */
    _discoverRouteOperationsPerGroup(localAddresses, routeGroup, routeTables) {
        const operations = [];
        const filteredRouteTables = this._filterRouteTables(
            routeTables,
            {
                name: routeGroup.routeName,
                tags: routeGroup.routeTags
            }
        );

        filteredRouteTables.forEach((routeTable) => {
            routeTable.Routes.forEach((route) => {
                const matchedAddressRange = this._matchRouteToAddressRange(
                    this._resolveRouteCidrBlock(route).cidrBlock,
                    routeGroup.routeAddressRanges
                );
                if (matchedAddressRange) {
                    const nextHopAddress = this._discoverNextHopAddress(
                        localAddresses,
                        routeTable.Tags,
                        matchedAddressRange.routeNextHopAddresses
                    );
                    if (nextHopAddress) {
                        operations.push(this._getUpdateOperationObject(
                            matchedAddressRange.routeAddresses, nextHopAddress, routeTable, route
                        ));
                    }
                }
            });
        });

        return Promise.all(operations)
            .then(routesToUpdate => routesToUpdate.filter(route => Object.keys(route).length))
            .catch(err => Promise.reject(err));
    }

    /**
    * Get update operation
    *
    * @param {Array} routeAddresses - array of route addresses
    * @param {String} address       - object containing group properties
    * @param {Object} routeTable    - route table
    * @param {Object} route         - route in route table
    *
    * @returns {Promise} { routeTable: {}, networkInterfaceId: '', routeAddress: '', ipVersion: '' }
    */
    _getUpdateOperationObject(routeAddresses, address, routeTable, route) {
        return this._getNetworkInterfaceId(address)
            .then((networkInterfaceId) => {
                this.logger.silly('Discovered networkInterfaceId ', networkInterfaceId);
                const updateRequired = (routeAddresses.indexOf(this._resolveRouteCidrBlock(route).cidrBlock) !== -1
                        && route.NetworkInterfaceId !== networkInterfaceId);
                this.logger.silly(`Update required (${updateRequired}) for route cidr block ${this._resolveRouteCidrBlock(route).cidrBlock}`);
                // if an update is not required just return an empty object
                if (!updateRequired) {
                    return Promise.resolve({});
                }
                // return information required for update later
                return Promise.resolve({
                    routeTableId: routeTable.RouteTableId,
                    networkInterfaceId,
                    routeAddress: this._resolveRouteCidrBlock(route).cidrBlock,
                    ipVersion: this._resolveRouteCidrBlock(route).ipVersion
                });
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Update addresses - given reassociate operation(s)
    *
    * @param {Object} operations - operations object
    *
    * @returns {Promise}
    */
    _updateRoutes(operations) {
        if (!operations || !operations.length) {
            this.logger.info('No route operations to run');
            return Promise.resolve();
        }

        const promises = [];
        operations.forEach((operation) => {
            promises.push(this._updateRouteTable(
                operation.routeTableId,
                operation.networkInterfaceId,
                operation.routeAddress,
                operation.ipVersion
            ));
        });
        return Promise.all(promises)
            .then(() => {
                this.logger.info('Route(s) updated successfully');
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Iterates through the routes and perfoms route replacement
     *
     * @param {Object} routeTable         - Route table with routes
     * @param {String} networkInterfaceId - Network interface that the route if to be updated to
     * @param {Array} routeAddressRange   - Route Address Range whose destination needs to be updated
     * @param {String} ipVersion          - IP Version of the route ('4' or '6')
     *
     * @returns {Promise} - Resolves or rejects if route is replaced
     */
    _updateRouteTable(routeTableId, networkInterfaceId, routeAddressRange, ipVersion) {
        this.logger.silly('Updating route: ', routeTableId, networkInterfaceId);

        const params = {
            NetworkInterfaceId: networkInterfaceId,
            RouteTableId: routeTableId
        };

        // check for IPv6, default to IPv4
        if (ipVersion === '6') {
            params.DestinationIpv6CidrBlock = routeAddressRange;
        } else {
            params.DestinationCidrBlock = routeAddressRange;
        }

        return this._replaceRoute(params)
            .catch(err => Promise.reject(err));
    }

    /**
     * Fetches the network interface ID given a private IP
     *
     * @param {String} privateIp - Private IP
     *
     * @returns {Promise} - Resolves with the network interface id associated with the private Ip or rejects
     */
    _getNetworkInterfaceId(privateIp) {
        const options = {
            tags: this.addressTags
        };
        const address = new IPAddressLib.Address4(privateIp);
        if (address.isValid()) {
            this.logger.debug('Using IPv4 filtering for to get nics', privateIp);
            options.privateAddress = privateIp;
        } else {
            this.logger.debug('Using IPv6 filtering for to get nics', privateIp);
            options.ipv6Address = privateIp;
        }
        return this._listNics(options)
            .then(nics => Promise.resolve(nics[0].NetworkInterfaceId))
            .catch(err => Promise.reject(err));
    }

    /**
     * Fetches the route tables based on the provided tag
     *
     * @param {Object} options                  - function options
     * @param {Object} [options.instanceId]     - object containing instanceId to filter on
     * @returns {Promise} - Resolves or rejects with list of route tables filtered by the supplied tag
     */
    _getRouteTables(options) {
        options = options || {};

        let params = {};
        if (options.instanceId) {
            params = this._addFilterToParams(params, 'route.instance-id', options.instanceId);
        }

        return this._describeRouteTables(params)
            .then(routeTables => Promise.resolve(routeTables.RouteTables))
            .catch(err => Promise.reject(err));
    }

    /**
     * Re-associates the Elastic IP Addresses. Will first attempt to disassociate and then associate
     * the Elastic IP Address(es) to the newly active BIG-IP
     *
     * @param {Object} operations - reassocate public address operations
     *
     * @returns {Promise} - Resolves or rejects with status of moving the EIP
     */
    _reassociatePublicAddresses(operations) {
        operations = operations || {};
        const disassociatePromises = [];
        const associatePromises = [];
        this.logger.debug('Starting disassociating Elastic IP', disassociatePromises);
        Object.keys(operations).forEach((eipKeys) => {
            const AssociationId = operations[eipKeys].current.AssociationId;
            // Disassociate EIP only if it is currently associated
            if (AssociationId) {
                disassociatePromises.push(this._retrier(this._disassociatePublicAddress, [AssociationId]));
            }
        });

        // Disassociate EIP, in case EIP wasn't created with ability to reassociate when already associated
        return Promise.all(disassociatePromises)
            .then(() => {
                this.logger.silly('Disassociation of Elastic IP addresses successful');

                Object.keys(operations).forEach((eipKeys) => {
                    const allocationId = operations[eipKeys].AllocationId;
                    const networkInterfaceId = operations[eipKeys].target.NetworkInterfaceId;
                    const privateIpAddress = operations[eipKeys].target.PrivateIpAddress;

                    // Associate EIP only if all variables are present
                    if (allocationId && networkInterfaceId && privateIpAddress) {
                        associatePromises.push(this._retrier(
                            this._associatePublicAddress,
                            [allocationId, networkInterfaceId, privateIpAddress]
                        ));
                    }
                });
                return Promise.all(associatePromises);
            })
            .then(() => {
                if (associatePromises.length === 0) {
                    this.logger.info('Association of Elastic IP addresses not required');
                } else {
                    this.logger.info('Association of Elastic IP addresses successful');
                }
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Disassociate the Elastic IP address
     *
     * @param {String} disassociationId  - Elastic IP associate to disassociate
     *
     * @returns {Promise} - A promise resolved or rejected based on the status of disassociating the Elastic IP Address
     */
    _disassociatePublicAddress(disassociationId) {
        this.logger.debug(`Disassociating address using ${disassociationId}`);

        const params = {
            AssociationId: disassociationId
        };

        return this.ec2.disassociateAddress(params).promise()
            .catch(err => Promise.reject(err));
    }

    /**
     * Associate the Elastic IP address to a PrivateIP address on a given NIC
     *
     * @param {String} allocationId         - Elastic IP allocation ID
     * @param {String} networkInterfaceId   - ID of NIC with the Private IP address
     * @param {String} privateIpAddress     - Private IP Address on the NIC to attach the Elastic IP address to
     *
     * @returns {Promise} - A Promise rejected or resolved based on the status of associating the Elastic IP address
     */
    _associatePublicAddress(allocationId, networkInterfaceId, privateIpAddress) {
        this.logger.debug(`Associating ${privateIpAddress} to ${networkInterfaceId} using ID ${allocationId}`);

        const params = {
            AllocationId: allocationId,
            NetworkInterfaceId: networkInterfaceId,
            PrivateIpAddress: privateIpAddress,
            AllowReassociation: true
        };

        return this.ec2.associateAddress(params).promise()
            .catch(err => Promise.reject(err));
    }

    /**
     * Reassociate public address to NIC
     *
     * @param {String} publicAddress      - public address to reassociate
     * @param {String} networkInterfaceId - network interface ID to associate to
     * @param {String} privateAddress     - private address to associate to
     *
     * @returns {Promise} - Resolves when the public address has been reassociated or rejects if an error occurs
     */
    _reassociatePublicAddressToNic(publicAddress, networkInterfaceId, privateAddress) {
        this.logger.debug(`Reassociating ${publicAddress} to ${privateAddress} attached to NIC ${networkInterfaceId}`);

        let addressInfo;

        return this._getElasticIPs({ publicAddress })
            .then((data) => {
                addressInfo = data.Addresses[0] || {};

                if (!addressInfo.AssociationId) {
                    return Promise.resolve();
                }
                return this._disassociatePublicAddress(addressInfo.AssociationId);
            })
            .then(() => this._associatePublicAddress(addressInfo.AllocationId, networkInterfaceId, privateAddress))
            .catch(err => Promise.reject(err));
    }

    /**
     * Re-associates addresses to different NICs via disassociate and then associate operations
     *
     * @param {Object} operations - operations we should perform
     *
     * @returns {Promise} - Resolves when all addresses are reassociated or rejects if an error occurs
     */
    _reassociateAddresses(operations) {
        operations = operations || {};
        const disassociate = operations.disassociate || [];
        const associate = operations.associate || [];
        let promises = [];
        this.logger.debug('Starting reassociating addresses using operations', operations);
        disassociate.forEach((association) => {
            const args = [association.networkInterfaceId, association.addresses];
            promises.push(this._retrier(this._disassociateAddressFromNic, args));
        });

        return Promise.all(promises)
            .then(() => {
                promises = [];
                associate.forEach((association) => {
                    const args = [association.networkInterfaceId, association.addresses];
                    promises.push(this._retrier(this._associateAddressToNic, args));
                });
                return Promise.all(promises);
            })
            .then(() => {
                this.logger.silly('Reassociation of addresses is complete');
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Disassociate address from NIC
     *
     * @param {String} networkInterfaceId - network interface ID
     * @param {Array} addresses           - addresses to disassociate: [{address: '', publicAddress: ''}]
     *
     * @returns {Promise} - Resolves when all addresses are disassociated or rejects if an error occurs
     */
    _disassociateAddressFromNic(networkInterfaceId, addresses) {
        this.logger.debug(`Disassociating ${util.stringify(addresses)} from ${networkInterfaceId}`);

        const params = this._getIpParamsByVersion(networkInterfaceId, addresses);
        this.logger.debug(`addresses ipv4Params to disassociate: ${util.stringify(params.ipv4)}`);
        this.logger.debug(`addresses ipv6params to disassociate: ${util.stringify(params.ipv6)}`);
        let promise = {};
        if (params.ipv6.Ipv6Addresses.length > 0) {
            this.logger.debug(`disassociating ipv6 addresses: ${util.stringify(params.ipv6)}`);
            promise = this.ec2.unassignIpv6Addresses(params.ipv6).promise();
        }
        return Promise.resolve(promise)
            .then(() => {
                if (params.ipv4.PrivateIpAddresses.length > 0) {
                    return this.ec2.unassignPrivateIpAddresses(params.ipv4).promise();
                }
                return Promise.resolve({});
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Associate address to NIC
     *
     * @param {String} networkInterfaceId - network interface ID
     * @param {Array} addresses           - addresses to associate: [{address: '', publicAddress: ''}]
     *
     * @returns {Promise} - Resolves when all addresses are associated or rejects if an error occurs
     */
    _associateAddressToNic(networkInterfaceId, addresses) {
        this.logger.debug(`Associating ${util.stringify(addresses)} to ${networkInterfaceId}`);

        const params = this._getIpParamsByVersion(networkInterfaceId, addresses);
        this.logger.debug(`addresses ipv4Params to associate: ${util.stringify(params.ipv4)}`);
        this.logger.debug(`addresses ipv6params to associate: ${util.stringify(params.ipv6)}`);
        let promise = {};
        if (params.ipv6.Ipv6Addresses.length > 0) {
            this.logger.debug(`associating ipv6 addresses: ${util.stringify(params.ipv6)}`);
            promise = this.ec2.assignIpv6Addresses(params.ipv6).promise();
        }
        return Promise.resolve(promise)
            .then(() => {
                if (params.ipv4.PrivateIpAddresses.length > 0) {
                    return this._assignPrivateIpv4Addresses(params.ipv4, addresses);
                }
                return Promise.resolve({});
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Construct params for IPv4 and IPv6
     *
     * @param {String} networkInterfaceId - network interface ID
     * @param {Array} addresses           - addresses to associate: [{address: '', publicAddress: ''}]
     *
     * @returns {Object} - Object of IPv4 and IPv6 params
     */
    _getIpParamsByVersion(networkInterfaceId, addresses) {
        const ipv4Params = {
            NetworkInterfaceId: networkInterfaceId,
            PrivateIpAddresses: []
        };
        const ipv6Params = {
            NetworkInterfaceId: networkInterfaceId,
            Ipv6Addresses: []
        };

        addresses.forEach((address) => {
            if (address.address) {
                if (address.ipVersion === 6) {
                    ipv6Params.Ipv6Addresses.push(address.address);
                } else {
                    ipv4Params.PrivateIpAddresses.push(address.address);
                }
            }
        });
        return { ipv4: ipv4Params, ipv6: ipv6Params };
    }

    /**
     *  Assign private IPv4 addresses
     *
     * @param {Object} ipv4Params          - params for IPv4
     * @param {Array} addresses            - addresses to assign: [{address: '', publicAddress: ''}]
     *
     * @returns {Promise} -                - resolved when private IPv4 addresses are assigned and
     * public addresses are reassociated to NIC
     */
    _assignPrivateIpv4Addresses(ipv4Params, addresses) {
        return this.ec2.assignPrivateIpAddresses(ipv4Params).promise()
            .then(() => {
                const promises = [];
                addresses.forEach((address) => {
                    if (address.publicAddress) {
                        promises.push(this._reassociatePublicAddressToNic(
                            address.publicAddress, ipv4Params.NetworkInterfaceId, address.address
                        ));
                    }
                });
                return Promise.all(promises);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Generate the Elastic IP configuration data required to reassociate the Elastic IP addresses
     *
     * @param {Object} eips               - Array of Elastic IP information, as returned from AWS.
     * @param {Object} privateInstanceIPs - Collection of Secondary Private IP addresses, and their associated NIC ID
     *
     * @returns {Promise} - A Promise that is resolved with the Elastic IP configuration, or rejected if an error occurs
     */
    _generatePublicAddressOperations(eips, privateInstanceIPs) {
        const updatedState = {};
        this.logger.debug(`eips: ${JSON.stringify(eips)}, privateInstanceIPs: ${JSON.stringify(privateInstanceIPs)}`);
        eips.forEach((eip) => {
            const vipsTag = eip.Tags.find(tag => constants.AWS_VIPS_TAGS.indexOf(tag.Key) !== -1);
            const targetAddresses = vipsTag ? vipsTag.Value.split(',') : [];
            targetAddresses.forEach((targetAddress) => {
                // Check if the target address is present on local BIG-IP, and if the EIP isn't already associated
                if (targetAddress in privateInstanceIPs && targetAddress !== eip.PrivateIpAddress) {
                    this.logger.silly(
                        `Moving public address: ${eip.PublicIp} to address: ${targetAddress}, and off of ${eip.PrivateIpAddress}`
                    );

                    updatedState[eip.PublicIp] = {
                        current: {
                            PrivateIpAddress: eip.PrivateIpAddress,
                            AssociationId: eip.AssociationId
                        },
                        target: {
                            PrivateIpAddress: targetAddress,
                            NetworkInterfaceId: privateInstanceIPs[targetAddress].NetworkInterfaceId
                        },
                        AllocationId: eip.AllocationId
                    };
                }
            });
        });
        this.logger.debug('Generated Public Address Operations', updatedState);
        return updatedState;
    }

    /**
    * Parse Nics - figure out which nics are 'mine' vs. 'theirs'
    *
    * Note: This function should ensure no duplicate nics are added
    *
    * @param {Object} nics              - nics
    * @param {Object} localAddresses    - local addresses
    * @param {Object} failoverAddresses - failover addresses
    *
    * @returns {Object} { 'mine': [], 'theirs': [] }
    */
    _parseNics(nics, localAddresses, failoverAddresses) {
        const myNics = [];
        const theirNics = [];
        // add nics to 'mine' or 'their' array based on address match
        nics.forEach((nic) => {
            // identify 'my' and 'their' nics
            const nicAddresses = nic.PrivateIpAddresses.map(i => i.PrivateIpAddress);
            localAddresses.forEach((address) => {
                const myNicIds = myNics.map(i => i.nic.NetworkInterfaceId);
                if (nicAddresses.indexOf(address) !== -1
                    && myNicIds.indexOf(nic.NetworkInterfaceId) === -1) {
                    myNics.push({ nic });
                }
            });
            failoverAddresses.forEach((address) => {
                const theirNicIds = theirNics.map(i => i.nic.NetworkInterfaceId);
                if (nicAddresses.indexOf(address) !== -1
                    && theirNicIds.indexOf(nic.NetworkInterfaceId) === -1) {
                    theirNics.push({ nic });
                }
            });
        });
        // remove any nics from 'their' array if they are also in 'my' array
        for (let p = myNics.length - 1; p >= 0; p -= 1) {
            for (let qp = theirNics.length - 1; qp >= 0; qp -= 1) {
                if (myNics[p].nic.NetworkInterfaceId === theirNics[qp].nic.NetworkInterfaceId) {
                    theirNics.splice(qp, 1);
                    break;
                }
            }
        }
        return { mine: myNics, theirs: theirNics };
    }

    /**
     * Check for any NIC operations required
     *
     * @param {Array} myNic             - 'my' NIC object
     * @param {Object} theirNic          - 'their' NIC object
     * @param {Object} failoverAddresses - failover addresses
     *
     * @returns {Object} { 'disassociate': [], 'association: [] }
     */
    _checkForNicOperations(myNic, theirNic, failoverAddresses) {
        const addressesToTake = [];
        const theirNicAddresses = theirNic.PrivateIpAddresses;

        // check if Ipv6Address exists and if so add it to the list
        this.logger.debug('_checkForNicOperations performing ipv6 check');
        if (theirNic.Ipv6Addresses && theirNicAddresses.length > 0) {
            theirNic.Ipv6Addresses.forEach((ipv6Address) => {
                theirNicAddresses.push(ipv6Address);
            });
        }

        this.logger.silly(`_checkForNicOperations myNic: ${util.stringify(myNic)}`);
        this.logger.silly(`_checkForNicOperations theirNic: ${util.stringify(theirNic)}`);
        this.logger.silly(`_checkForNicOperations failoverAddress: ${util.stringify(failoverAddresses)}`);
        this.logger.silly(`length of theirNicAddresses: ${theirNicAddresses.length}, failoverAddresses: ${failoverAddresses.length}`);
        for (let i = theirNicAddresses.length - 1; i >= 0; i -= 1) {
            for (let t = failoverAddresses.length - 1; t >= 0; t -= 1) {
                this.logger.silly(`failoverAddress: ${util.stringify(failoverAddresses[t])}`);
                this.logger.silly(`theirNicAddress: ${util.stringify(theirNicAddresses[i])}`);
                if (theirNicAddresses[i].PrivateIpAddress
                    && failoverAddresses[t] === theirNicAddresses[i].PrivateIpAddress
                    && theirNicAddresses[i].Primary !== true) {
                    this.logger.silly('Match:', theirNicAddresses[i].PrivateIpAddress, theirNicAddresses[i]);

                    addressesToTake.push({
                        address: theirNicAddresses[i].PrivateIpAddress,
                        publicAddress: util.getDataByKey(theirNicAddresses[i], 'Association.PublicIp'),
                        ipVersion: 4
                    });
                } else if (theirNicAddresses[i].Ipv6Address
                    && util.validateIpv6Address(failoverAddresses[t])
                    && failoverAddresses[t] !== theirNicAddresses[i].Ipv6Address) {
                    this.logger.silly(`will add address ${failoverAddresses[t]} into addressToTake`);
                    addressesToTake.push({
                        address: failoverAddresses[t],
                        ipVersion: 6
                    });
                }
            }
        }
        this.logger.silly(`addressesToTake: ${util.stringify(addressesToTake)}`);
        return {
            disassociate: {
                networkInterfaceId: theirNic.NetworkInterfaceId,
                addresses: addressesToTake
            },
            associate: {
                networkInterfaceId: myNic.NetworkInterfaceId,
                addresses: addressesToTake
            }
        };
    }

    /**
     * Get all Private Secondary IP addresses for this BIG-IP, and their associated NIC ID
     *
     * @returns {Promise}   - A Promise that will be resolved with all of the Private Secondary IP address, or
     *                          rejected if an error occurs. Example response:
     *
     *                          {
     *                              "10.0.11.139": {
     *                                  "NetworkInterfaceId":"eni-034a05fef728d501b"
     *                              }
     *                          }
     */
    _getPrivateSecondaryIPs() {
        let params = {
            Filters: []
        };
        params = this._addFilterToParams(params, 'attachment.instance-id', this.instanceId);

        return this._describeNetworkInterfaces(params)
            .then((data) => {
                this.logger.silly(`data found in Network interfaces: ${util.stringify(data)}`);
                const privateIps = {};
                data.NetworkInterfaces.forEach((nic) => {
                    nic.PrivateIpAddresses.forEach((privateIp) => {
                        if (privateIp.Primary === false) {
                            privateIps[privateIp.PrivateIpAddress] = {
                                NetworkInterfaceId: nic.NetworkInterfaceId
                            };
                        }
                    });
                });
                this.logger.silly(`privateIps discovered: ${util.stringify(privateIps)}`);
                return Promise.resolve(privateIps);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * List nics from EC2, optionally filter using tags and/or private address
     *
     * @param {Object} options                  - function options
     * @param {Object} [options.tags]           - object containing tags to filter on: { 'key': 'value' }
     * @param {String} [options.privateAddress] - String containing private address to filter
     * @param {String} [options.ipv6Address]    - String containing ipv6 address to filter
     *
     * @returns {Promise} - A Promise that will be resolved with thearray of NICs,
     * or rejected if an error occurs.  Example response:
     *                      [
     *                          {
     *                              "NetworkInterfaceId": "id",
     *                              "PrivateIpAddresses": [],
     *                              ...
     *                          }
     *                      ]
     */
    _listNics(options) {
        options = options || {};
        const tags = options.tags || null;
        const privateAddress = options.privateAddress || null;
        const ipv6Address = options.ipv6Address || null;

        let params = {
            Filters: []
        };
        if (tags) {
            Object.keys(tags).forEach((tagKey) => {
                params = this._addFilterToParams(params, `tag:${tagKey}`, tags[tagKey]);
            });
        }
        if (privateAddress) {
            params = this._addFilterToParams(params, 'private-ip-address', privateAddress);
        }

        if (ipv6Address) {
            params = this._addFilterToParams(params, 'ipv6-addresses.ipv6-address', ipv6Address);
        }

        return this._describeNetworkInterfaces(params)
            .then((data) => {
                const nics = [];
                data.NetworkInterfaces.forEach((nic) => {
                    nics.push(nic);
                });
                return Promise.resolve(nics);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Returns the Elastic IP address(es) associated with this BIG-IP cluster
     *
     * @param {Object} options                 - function options
     * @param {Object} [options.tags]          - object containing tags to filter on { 'key': 'value' }
     * @param {Object} [options.instanceId]    - object containing instanceId to filter on
     * @param {Object} [options.publicAddress] - object containing public address to filter on
     * @param {Object} [options.privateAddress] - object containing private address to filter on
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of Elastic IP(s), or
     *                          rejected if an error occurs
     */
    _getElasticIPs(options) {
        options = options || {};
        const tags = options.tags || null;
        const instanceId = options.instanceId || null;
        const publicAddress = options.publicAddress || null;
        const privateAddress = options.privateAddress || null;

        let params = {
            Filters: []
        };
        if (tags) {
            const tagKeys = Object.keys(tags);
            tagKeys.forEach((tagKey) => {
                params = this._addFilterToParams(params, `tag:${tagKey}`, tags[tagKey]);
            });
        }
        if (instanceId) {
            params = this._addFilterToParams(params, 'instance-id', this.instanceId);
        }
        if (publicAddress) {
            params = this._addFilterToParams(params, 'public-ip', publicAddress);
        }

        if (privateAddress) {
            params = this._addFilterToParams(params, 'private-ip-address', privateAddress);
        }
        return this.ec2.describeAddresses(params).promise()
            .catch(err => Promise.reject(err));
    }

    /**
     * Gets instance identity document
     *
     * @returns {Promise}   - A Promise that will be resolved with the Instance Identity document or
     *                          rejected if an error occurs
     */
    _getInstanceIdentityDoc() {
        return new Promise((resolve, reject) => {
            const iidPath = '/latest/dynamic/instance-identity/document';
            this.metadata.request(iidPath, (err, data) => {
                if (err) {
                    this.logger.error('Unable to retrieve Instance Identity');
                    reject(err);
                }
                resolve(
                    JSON.parse(data)
                );
            });
        });
    }

    /**
     * Gets the S3 bucket to use, from the provided storage tags
     *
     * @param   {Object}    tags - object containing tags to filter on { 'key': 'value' }
     *
     * @returns {Promise}   - A Promise that will be resolved with the S3 bucket name or
     *                          rejected if an error occurs
     */
    _getS3BucketByTags(tags) {
        const getBucketTagsPromises = [];

        return this._getAllS3Buckets()
            .then((data) => {
                data.forEach((bucket) => {
                    const getTagsArgs = [bucket, { continueOnError: true }];
                    getBucketTagsPromises.push(this._retrier(this._getTags, getTagsArgs));
                });
                return Promise.all(getBucketTagsPromises);
            })
            // Filter out any 'undefined' responses
            .then(data => Promise.resolve(data.filter(i => i)))
            .then((taggedBuckets) => {
                const tagKeys = Object.keys(tags);
                const filteredBuckets = taggedBuckets.filter((taggedBucket) => {
                    let matchedTags = 0;
                    const bucketDict = this._normalizeTags(taggedBucket.TagSet);
                    tagKeys.forEach((tagKey) => {
                        if (Object.keys(bucketDict).indexOf(tagKey) !== -1 && bucketDict[tagKey] === tags[tagKey]) {
                            matchedTags += 1;
                        }
                    });
                    return tagKeys.length === matchedTags;
                });
                this.logger.debug('Filtered Buckets:', filteredBuckets);
                return Promise.resolve(filteredBuckets);
            })
            .then((filteredBuckets) => {
                if (!filteredBuckets.length) {
                    return Promise.reject(new Error('No valid S3 Buckets found!'));
                }
                return Promise.resolve(filteredBuckets[0].Bucket); // grab the first bucket for now
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Get all S3 buckets in account filtered by current region, however if no buckets are found in the region
     * or any error occurs during region filtering this method returns all the s3 buckets.
     * These buckets will later be filtered by tags
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of every S3 bucket name or
     *                          rejected if an error occurs
     */
    _getAllS3Buckets() {
        let bucketNameList = [];
        const listAllBuckets = () => this.s3.listBuckets({}).promise()
            .then((data) => {
                const bucketNames = data.Buckets.map(b => b.Name);
                return Promise.resolve(bucketNames);
            })
            .then((bucketNames) => {
                const promises = [];
                bucketNameList = bucketNames;
                bucketNames.forEach((bucketName) => {
                    promises.push(this._matchBucketLocationWithCurrentRegion(bucketName));
                });
                return Promise.all(promises);
            })
            .then((matchedBuckets) => {
                const filteredBuckets = matchedBuckets.filter(matchedBucket => matchedBucket.matched === true);
                return Promise.resolve(filteredBuckets.length === 0
                    ? bucketNameList : filteredBuckets.map(b => b.name));
            })
            .catch(err => Promise.reject(err));

        return this._retrier(listAllBuckets, []);
    }

    /**
     * Get the region of a given S3 bucket
     *
     * @param   {String}    bucketName                    - name of the S3 bucket
     *
     * @returns {Promise}     - A Promise that will be resolved with a boolean value
     *                          if the configured region matches the buckets region and bucket name.
     *                          If an error occurs when getting the location the bucket will
     *                          not be considered matched.
     */
    _matchBucketLocationWithCurrentRegion(bucketName) {
        const bucketObject = {
            name: bucketName,
            matched: false
        };
        let bucketRegion = 'us-east-1'; // default since if region is null then the bucket is in us-east-1
        return this.s3.getBucketLocation({ Bucket: bucketName }).promise()
            .then((data) => {
                bucketRegion = data.LocationConstraint || bucketRegion;
                bucketObject.matched = bucketRegion === this.region;
                return Promise.resolve(bucketObject);
            })
            .catch((err) => {
                this.logger.debug(`Unable to get ${bucketName} region info. ${err}`);
                return Promise.resolve(bucketObject);
            });
    }

    /**
     * Get the Tags of a given S3 bucket, optionally rejecting or resolving on errors
     *
     * @param   {String}    bucket                    - name of the S3 bucket
     * @param   {Object}    options                   - function options
     * @param   {Boolean}   [options.continueOnError] - whether or not to reject on error. Default: reject on error
     *
     * @returns {Promise}   - A Promise that will be resolved with the S3 bucket name or
     *                          rejected if an error occurs
     */
    _getTags(bucket, options) {
        options = options || {};
        const continueOnError = options.continueOnError || false;
        const params = {
            Bucket: bucket
        };
        return this.s3.getBucketTagging(params).promise()
            .then(data => Promise.resolve({
                Bucket: params.Bucket,
                TagSet: data.TagSet
            }))
            .catch((err) => {
                if (!continueOnError) {
                    return Promise.reject(err);
                }
                return Promise.resolve(); // resolving since ignoring permissions errors to extraneous buckets
            });
    }

    /**
     * Describe EC2 network interfaces, with retry logic
     *
     * @param {Object} params - parameter options for operation
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _describeNetworkInterfaces(params) {
        const func = _params => this.ec2.describeNetworkInterfaces(_params).promise();

        return this._retrier(func, [params])
            .catch(err => Promise.reject(err));
    }

    /**
     * Describe EC2 route tables, with retry logic
     *
     * @param {Object} params - parameter options for operation
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _describeRouteTables(params) {
        const func = _params => this.ec2.describeRouteTables(_params).promise();

        return this._retrier(func, [params])
            .catch(err => Promise.reject(err));
    }

    /**
     * Describe EC2 route tables, with retry logic
     *
     * @param {Object} params - parameter options for operation
     *
     * @returns {Promise} - A Promise that will be resolved with the API response
     */
    _replaceRoute(params) {
        const func = _params => this.ec2.replaceRoute(_params).promise();

        return this._retrier(func, [params])
            .catch(err => Promise.reject(err));
    }
}

module.exports = {
    Cloud
};
