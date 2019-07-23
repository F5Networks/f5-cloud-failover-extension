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

class Cloud extends AbstractCloud {
    constructor(options) {
        super(CLOUD_PROVIDERS.AWS, options);
    }

    /**
    * Initialize the Cloud Provider. Called at the beginning of processing, and initializes required cloud clients
    *
    * @param {Object} options       - function options
    * @param {Array} [options.tags] - array containing tags to filter on [{'key': 'myKey', 'value': 'myValue' }]
    */
    init(options) {
        options = options || {};
        this.tags = options.tags || null;

        return this._getInstanceIdentityDoc()
            .then((metadata) => {
                this.region = metadata.region;
                this.instanceId = metadata.instanceId;

                AWS.config.update({ region: this.region });
                this.ec2 = new AWS.EC2();
            })
            .catch(err => Promise.reject(err));
    }

    /**
    * Updates the Public IP Addresses on the BIG-IP Cluster, by re-associating AWS Elastic IP Addresses
    *
    * @returns {Promise} - Resolves or rejects with the status of re-associating the Elastic IP Address(es)
    */
    // TODO: Need VirtualAddresses from BIG-IP, or just failover with what we know from AWS?
    updateAddresses() {
        return Promise.all([
            this._getElasticIPs(this.tags),
            this._getPrivateSecondaryIPs()
        ]).then((results) => {
            const eips = results[0].Addresses;
            const secondaryPrivateIps = results[1];

            return this._generateNewEIPConfigs(eips, secondaryPrivateIps);
        }).then((results) => {
            this.logger.info('Reassociating Elastic IP addresses');
            return this._reassociateEIPs(results);
        }).catch(err => Promise.reject(err));
    }

    /**
     * Re-associates the Elastic IP Addresses. Will first attempt to disassociate and then associate
     * the Elastic IP Address(es) to the newly active BIG-IP
     *
     * @param {Object} EIPConfigs - EIP Configuration we should set // TODO: expected structure
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
                if (disassociatePromises.length === 0) {
                    this.logger.info('Disassociation of Elastic IP addresses not required');
                } else {
                    this.logger.info('Disassociation of Elastic IP addresses successful');
                }

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

            this.ec2.disassociateAddress(params, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
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
            this.ec2.associateAddress(params, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    /**
     * @param eips - all tagged EIPs TODO: What is expected structure?
     * @param privateInstanceIPs - IPs for this instance TODO: What is the expected structure?
     * // TODO: If EIP is already where it belongs, don't need to do any work
     * // TODO: What is the structure of the returned object?
     */
    _generateNewEIPConfigs(eips, privateInstanceIPs) {
        const updatedState = {};
        // TODO: 'VIPS' should be a constant. Question: Should it be defined in the POST payload?
        const vipTagKey = 'VIPS';
        eips.forEach((eip) => {
            const targetAddresses = eip.Tags.find(tag => tag.Key === vipTagKey).Value.split(',');
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
     * Get all Private Secondary IP addresses for this BIG-IP
     * TODO: What does the returned structure look like?
     *
     * @returns {Promise}   - A Promise that will be resolved with all of the Private Secondary IP address, or
     *                          rejected if an error occurs
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
     * TODO: What does the returned structure look like?
     *
     * @param   {Object}    tags    - Array containing tags to filter on [{'key': 'myKey', 'value': 'myValue' }]
     *
     * @returns {Promise}   - A Promise that will be resolved with an array of Elastic IP(s), or
     *                          rejected if an error occurs
     */
    _getElasticIPs(tags) {
        const params = {
            Filters: []
        };
        tags.forEach((tag) => {
            params.Filters.push(
                {
                    Name: `tag:${tag.key}`,
                    Values: [
                        tag.value
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
            const metadata = new AWS.MetadataService();
            const iidPath = '/latest/dynamic/instance-identity/document';
            metadata.request(iidPath, (err, data) => {
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
}

module.exports = {
    Cloud
};
