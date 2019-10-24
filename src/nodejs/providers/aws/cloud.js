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

const AWS = require('aws-sdk');
const CLOUD_PROVIDERS = require('../../constants').CLOUD_PROVIDERS;
const util = require('../../util');
const AbstractCloud = require('../abstract/cloud.js').AbstractCloud;
const constants = require('../../constants');

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AWS, options);

        this.metadata = new AWS.MetadataService();
        this.s3 = {};
        this.ec2 = {};
    }

    /**
    * Initialize the Cloud Provider. Called at the beginning of processing, and initializes required cloud clients
    *
    * @param {Object} options        - function options
    * @param {Object} [options.tags]            - object containing tags to filter on { 'key': 'value' }
    * @param {Object} [options.routeTags]       - object containing tags to filter on { 'key': 'value' }
    * @param {Object} [options.routeAddresses]  - object containing addresses to filter on [ '192.0.2.0/24' ]
    * @param {String} [options.routeSelfIpsTag] - object containing self IP's tag to match against: 'f5_self_ips'
    * @param {Object} [options.storageTags]     - object containing storage tags to filter on { 'key': 'value' }
    */
    init(options) {
        options = options || {};
        this.tags = options.tags || null;
        this.storageTags = options.storageTags || null;
        this.s3FilePrefix = constants.STORAGE_FOLDER_NAME;
        this.routeTags = options.routeTags || {};
        this.routeAddresses = options.routeAddresses || [];
        this.routeSelfIpsTag = options.routeSelfIpsTag || '';


        return this._getInstanceIdentityDoc()
            .then((metadata) => {
                this.region = metadata.region;
                this.instanceId = metadata.instanceId;

                AWS.config.update({ region: this.region });
                this.ec2 = new AWS.EC2();
                this.s3 = new AWS.S3();

                return this._getS3BucketByTags(this.storageTags);
            })
            .then((bucketName) => {
                this.s3BucketName = bucketName;
                return Promise.resolve();
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
        this.logger.silly(`Uploading data to: ${s3Key} ${util.stringify(data)}`);

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

        return util.retrier.call(this, uploadObject);
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

        return util.retrier.call(this, downloadObject);
    }

    /**
    * Update Addresses - Updates the public ip(s) on the BIG-IP Cluster, by re-associating Elastic IP Addresses
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
        const discoverOnly = options.discoverOnly || false;
        const updateOperations = options.updateOperations;

        this.logger.silly('updateAddresses: ', options);

        // discover only logic
        if (discoverOnly === true) {
            return this._discoverAddressOperations()
                .catch(err => Promise.reject(err));
        }
        // update only logic
        if (updateOperations) {
            return this._updateAddresses(updateOperations)
                .catch(err => Promise.reject(err));
        }
        // default - discover and update
        return this._discoverAddressOperations()
            .then(operations => this._updateAddresses(operations))
            .catch(err => Promise.reject(err));
    }

    /**
    * Discover address operations
    *
    * @returns {Promise} { 'x.x.x.x': {} }
    */
    _discoverAddressOperations() {
        return Promise.all([
            this._getElasticIPs(this.tags),
            this._getPrivateSecondaryIPs()
        ])
            .then((results) => {
                const eips = results[0].Addresses;
                const secondaryPrivateIps = results[1];

                return this._generateEIPConfigs(eips, secondaryPrivateIps);
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
    _updateAddresses(operations) {
        return this._reassociateEIPs(operations)
            .then(() => {
                this.logger.info('EIP(s) reassociated successfully');
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Updates the route table on the BIG-IP Cluster, by using the routeSelfIpsTag tag to find the network interface the
     * scoping address would need to be routed to and then updating or creating a new route to the network interface
     *
     * @param {Object} options                     - function options
     * @param {Object} [options.localAddresses]    - object containing local (self) addresses [ '192.0.2.1' ]
     * @param {Object} [options.failoverAddresses] - object containing failover addresses [ '192.0.2.1' ]
     * @param {Boolean} [options.discoverOnly]     - only perform discovery operation
     * @param {Object} [options.updateOperations]  - skip discovery and perform 'these' update operations
     *
     * @returns {Promise} - Resolves or rejects with the status of updating the route table
     */
    updateRoutes(options) {
        options = options || {};
        const localAddresses = options.localAddresses || [];
        const discoverOnly = options.discoverOnly || false;
        const updateOperations = options.updateOperations;

        this.logger.silly('updateRoutes: ', options);

        // discover only logic
        if (discoverOnly === true) {
            return this._discoverRouteOperations(localAddresses)
                .catch(err => Promise.reject(err));
        }
        // update only logic
        if (updateOperations) {
            return this._updateRoutes(updateOperations)
                .catch(err => Promise.reject(err));
        }
        // default - discover and update
        return this._discoverRouteOperations(localAddresses)
            .then(operations => this._updateRoutes(operations))
            .catch(err => Promise.reject(err));
    }

    /**
    * Discover route operations
    *
    * @param {Array} localAddresses - array containing local (self) addresses [ '192.0.2.1' ]
    *
    * @returns {Promise} [ { routeTable: {}, networkInterfaceId: 'foo' }]
    */
    _discoverRouteOperations(localAddresses) {
        localAddresses = localAddresses || [];

        const _getUpdateOperationObject = (ip, routeTable) => this._getNetworkInterfaceId(ip)
            .then(networkInterfaceId => Promise.resolve({ routeTable, networkInterfaceId }))
            .catch(err => Promise.reject(err));

        return this._getRouteTables(this.routeTags)
            .then((routeTables) => {
                const promises = [];

                this.logger.debug('Route Tables: ', routeTables);
                routeTables.forEach((routeTable) => {
                    const getSelfIpsFromTag = routeTable.Tags.filter(tag => this.routeSelfIpsTag === tag.Key)[0];
                    if (!getSelfIpsFromTag) {
                        this.logger.warn(`expected tag: ${this.routeSelfIpsTag} does not exist on route table`);
                    }

                    const selfIpsToUse = getSelfIpsFromTag.Value.split(',').map(i => i.trim());
                    const selfIpToUse = selfIpsToUse.filter(item => localAddresses.indexOf(item) !== -1)[0];
                    if (!selfIpToUse) {
                        this.logger.warn(`local addresses: ${localAddresses} not in selfIpsToUse: ${selfIpsToUse}`);
                    }

                    promises.push(_getUpdateOperationObject(selfIpToUse, routeTable));
                });
                return Promise.all(promises);
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
        const promises = [];

        operations.forEach((operation) => {
            promises.push(this._updateRouteTable(operation.routeTable, operation.networkInterfaceId));
        });
        return Promise.all(promises)
            .then(() => {
                this.logger.info('Route(s) updated successfully');
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * _updateRouteTable iterates through the routes and calls _replaceRoute if expected route exists
     *
     * @param {Object} routeTable - Route table with routes
     * @param {String} networkInterfaceId - Network interface that the route if to be updated to
     *
     * @returns {Promise} - Resolves or rejects if route is replaced
     */
    _updateRouteTable(routeTable, networkInterfaceId) {
        const promises = [];
        routeTable.Routes.forEach((route) => {
            if (this.routeAddresses.indexOf(route.DestinationCidrBlock) !== -1) {
                this.logger.info('Updating route: ', route);
                promises.push(this._replaceRoute(
                    route.DestinationCidrBlock,
                    networkInterfaceId,
                    routeTable.RouteTableId
                ));
            }
        });
        return Promise.all(promises)
            .catch(err => Promise.reject(err));
    }

    /**
     * Fetches the route tables based on the provided tag
     *
     * @param {Object} privateIp - Private IP
     *
     * @returns {Promise} - Resolves with the network interface id associated with the private Ip or rejects
     */
    _getNetworkInterfaceId(privateIp) {
        const params = {
            Filters: [
                {
                    Name: 'private-ip-address',
                    Values: [privateIp]
                }]
        };
        return new Promise((resolve, reject) => {
            this.ec2.describeNetworkInterfaces(params).promise()
                .then((data) => {
                    const networkId = data.NetworkInterfaces[0].NetworkInterfaceId;
                    resolve(networkId);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Fetches the route tables based on the provided tag
     *
     * @param {Object} tags - List of tags
     *
     * @returns {Promise} - Resolves or rejects with list of route tables filtered by the supplied tag
     */
    _getRouteTables(tags) {
        const params = {
            Filters: []
        };

        const tagKeys = Object.keys(tags);
        tagKeys.forEach((tagKey) => {
            params.Filters.push(
                {
                    Name: `tag:${tagKey}`,
                    Values: [
                        tags[tagKey]
                    ]
                }
            );
        });
        return new Promise((resolve, reject) => {
            this.ec2.describeRouteTables(params)
                .promise()
                .then((routeTables) => {
                    resolve(routeTables.RouteTables);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Replaces route in a route table
     *
     * @param {String} distCidr - Destination Cidr of the Route that is to be replaced
     * @param {String} networkInterfaceId - Network interface ID to update the route to
     * @param {String} routeTableId - Route table ID where the route is to be updated
     *
     * @returns {Promise} - Resolves or rejects with list of route tables filtered by the supplied tag
     */
    _replaceRoute(distCidr, networkInterfaceId, routeTableId) {
        const params = {
            DestinationCidrBlock: distCidr,
            NetworkInterfaceId: networkInterfaceId,
            RouteTableId: routeTableId
        };
        return new Promise((resolve, reject) => {
            this.ec2.replaceRoute(params).promise()
                .then((data) => {
                    resolve(data);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Re-associates the Elastic IP Addresses. Will first attempt to disassociate and then associate
     * the Elastic IP Address(es) to the newly active BIG-IP
     *
     * @param {Object} EIPConfigs - EIP Configuration we should set
     *
     * @returns {Promise} - Resolves or rejects with status of moving the EIP
     */
    _reassociateEIPs(EIPConfigs) {
        const disassociatePromises = [];
        const associatePromises = [];

        Object.keys(EIPConfigs).forEach((eipKeys) => {
            const AssociationId = EIPConfigs[eipKeys].current.AssociationId;
            // Disassociate EIP only if it is currently associated
            if (AssociationId) {
                disassociatePromises.push(util.retrier.call(this, this._disassociateIpAddress, [AssociationId]));
            }
        });
        // Disassociate EIP, in case EIP wasn't created with ability to reassociate when already associated
        return Promise.all(disassociatePromises)
            .then(() => {
                this.logger.silly('Disassociation of Elastic IP addresses successful');

                Object.keys(EIPConfigs).forEach((eipKeys) => {
                    const allocationId = EIPConfigs[eipKeys].AllocationId;
                    const networkInterfaceId = EIPConfigs[eipKeys].target.NetworkInterfaceId;
                    const privateIpAddress = EIPConfigs[eipKeys].target.PrivateIpAddress;

                    // Associate EIP only if all variables are present
                    if (allocationId && networkInterfaceId && privateIpAddress) {
                        associatePromises.push(
                            util.retrier.call(this, this._associateIpAddress,
                                [allocationId, networkInterfaceId, privateIpAddress])
                        );
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
                return Promise.resolve();
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Disassociate the Elastic IP address
     *
     * @param {String} associationIdToDisassociate  - Elastic IP associate to disassociate
     *
     * @returns {Promise} - A promise resolved or rejected based on the status of disassociating the Elastic IP Address
     */
    _disassociateIpAddress(associationIdToDisassociate) {
        return new Promise((resolve, reject) => {
            this.logger.debug(`disassociating: ${associationIdToDisassociate}`);
            const params = {
                AssociationId: associationIdToDisassociate
            };

            this.ec2.disassociateAddress(params).promise()
                .then((data) => {
                    resolve(data);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Associate the Elastic IP address to a PrivateIP address on a given NIC
     * @param {String} allocationId         - Elastic IP allocation ID
     * @param {String} networkInterfaceId   - ID of NIC with the Private IP address
     * @param {String} privateIpAddress     - Private IP Address on the NIC to attach the Elastic IP address to
     *
     * @returns {Promise} - A Promise rejected or resolved based on the status of associating the Elastic IP address
     */
    _associateIpAddress(allocationId, networkInterfaceId, privateIpAddress) {
        return new Promise((resolve, reject) => {
            this.logger.debug(`associating: ${allocationId} to ${privateIpAddress}`);
            const params = {
                AllocationId: allocationId,
                NetworkInterfaceId: networkInterfaceId,
                PrivateIpAddress: privateIpAddress,
                AllowReassociation: true
            };
            this.ec2.associateAddress(params).promise()
                .then((data) => {
                    resolve(data);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Generate the Elastic IP configuration data required to reassociate the Elastic IP addresses
     *
     * @param {Object} eips                 - Array of Elastic IP information, as returned from AWS.
     * @param {Object} privateInstanceIPs   - Collection of Secondary Private IP addresses, and their associated NIC ID
     *
     * @returns {Promise} - A Promise that is resolved with the Elastic IP configuration, or rejected if an error occurs
     */
    _generateEIPConfigs(eips, privateInstanceIPs) {
        const updatedState = {};
        eips.forEach((eip) => {
            const targetAddresses = eip.Tags.find(tag => tag.Key === constants.AWS_VIPS_TAG).Value.split(',');
            targetAddresses.forEach((targetAddress) => {
                // Check if the target address is present on local BIG-IP, and if the EIP isn't already associated
                if (targetAddress in privateInstanceIPs && targetAddress !== eip.PrivateIpAddress) {
                    this.logger.info(
                        `Moving Elastic IP: ${eip.PublicIp} to Private IP: ${targetAddress}, and off of ${eip.PrivateIpAddress}`
                    );

                    updatedState[eip.PublicIp] = {
                        target: {
                            PrivateIpAddress: targetAddress,
                            NetworkInterfaceId: privateInstanceIPs[targetAddress].NetworkInterfaceId
                        },
                        current: {
                            PrivateIpAddress: eip.PrivateIpAddress,
                            AssociationId: eip.AssociationId
                        },
                        AllocationId: eip.AllocationId
                    };
                }
            });
        });
        return updatedState;
    }

    /**
     * Get all Private Secondary IP addresses for this BIG-IP, and their associated NIC ID
     *
     * @returns {Promise}   - A Promise that will be resolved with all of the Private Secondary IP address, or
     *                          rejected if an error occurs. Example response:
     *
     *                          {
     *                              "10.0.11.139":
     *                              {
     *                                  "NetworkInterfaceId":"eni-034a05fef728d501b"
     *                              },
     *                              "10.0.11.82":
     *                              {
     *                                  "NetworkInterfaceId":"eni-034a05fef728d501b"
     *                              }
     *                          }
     */
    _getPrivateSecondaryIPs() {
        const params = {
            Filters: [
                {
                    Name: 'attachment.instance-id',
                    Values: [this.instanceId]
                }
            ]
        };
        return new Promise((resolve, reject) => {
            this.ec2.describeNetworkInterfaces(params).promise()
                .then((data) => {
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
                    resolve(privateIps);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Returns the Elastic IP address(es) associated with this BIG-IP cluster
     *
     * @param   {Object}    tags - object containing tags to filter on { 'key': 'value' }
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of Elastic IP(s), or
     *                          rejected if an error occurs
     */
    _getElasticIPs(tags) {
        const params = {
            Filters: []
        };

        const tagKeys = Object.keys(tags);
        tagKeys.forEach((tagKey) => {
            params.Filters.push(
                {
                    Name: `tag:${tagKey}`,
                    Values: [
                        tags[tagKey]
                    ]
                }
            );
        });
        return new Promise((resolve, reject) => {
            this.ec2.describeAddresses(params).promise()
                .then((data) => {
                    resolve(data);
                })
                .catch(err => reject(err));
        });
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
                    getBucketTagsPromises.push(util.retrier.call(this, this._getTags, getTagsArgs));
                });
                return Promise.all(getBucketTagsPromises);
            })
            // Filter out any 'undefined' responses
            .then(data => Promise.resolve(data.filter(i => i)))
            .then((taggedBuckets) => {
                const tagKeys = Object.keys(tags);
                const filteredBuckets = taggedBuckets.filter((taggedBucket) => {
                    let matchedTags = 0;
                    const bucketDict = taggedBucket.TagSet.reduce((acc, cur) => {
                        acc[cur.Key] = cur.Value;
                        return acc;
                    }, {});
                    tagKeys.forEach((tagKey) => {
                        if (Object.keys(bucketDict).indexOf(tagKey) !== -1 && bucketDict[tagKey] === tags[tagKey]) {
                            matchedTags += 1;
                        }
                    });
                    return tagKeys.length === matchedTags;
                });
                this.logger.info('Filtered Buckets:');
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
     * Get all S3 buckets in account, these buckets will later be filtered by tags
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of every S3 bucket name or
     *                          rejected if an error occurs
     */
    _getAllS3Buckets() {
        const listAllBuckets = () => new Promise((resolve, reject) => {
            this.s3.listBuckets({}).promise()
                .then((data) => {
                    const bucketNames = data.Buckets.map(b => b.Name);
                    resolve(bucketNames);
                })
                .catch(err => reject(err));
        });
        return util.retrier.call(this, listAllBuckets);
    }

    /**
     * Get the Tags of a given S3 bucket, optionally rejecting or resolving on errors
     *
     * @param   {String}    bucket                  - name of the S3 bucket
     * @param   {Object}    options                 - function options
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
        return new Promise((resolve, reject) => {
            this.s3.getBucketTagging(params).promise()
                .then((data) => {
                    resolve({
                        Bucket: params.Bucket,
                        TagSet: data.TagSet
                    });
                })
                .catch((err) => {
                    if (!continueOnError) {
                        reject(err);
                    }
                    resolve(); // resolving since ignoring permissions errors to extraneous buckets
                });
        });
    }
}

module.exports = {
    Cloud
};
