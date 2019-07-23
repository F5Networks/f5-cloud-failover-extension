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
    * Update Addresses
    *
    * @param {Object}   deviceInfo
    * @param {Object}   [deviceInfo.allVirtualAddresses]    - All virtual addresses on the BIG-IP
    *
    * @returns {Object}
    */
    updateAddresses(deviceInfo) {
        this.logger.info('got some addresses:');
        this.logger.info(`localAddresses: ${deviceInfo.localAddresses}`); // 10.0.11.136
        this.logger.info(`failoverAddresses: ${deviceInfo.failoverAddresses}`); // undef
        this.logger.info('allVirtuals:');
        this.logger.info(deviceInfo.allVirtualAddresses);

        return this._getElasticIPs(this.tags)
            .then((eips) => {
                this.logger.info('EIPS:');
                this.logger.info(eips);
                // TODO: shouldn't be global in future. Or should it?
                this.eips = eips.Addresses;
            })
            .then(() => {
                deviceInfo.allVirtualAddresses.forEach((vip) => {
                    this.logger.info(vip);
                });
                return this._getPrivateSecondaryIPs();
            })
            .then((data) => {
                this.logger.info('secondary private IP');
                this.logger.info(data);
                // for each EIP, we should re-assoc
                return this._generateNewEIPConfigs(data);
            })
            .then((data) => {
                this.logger.info(data);
                this._reassociateEIPs(data);
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Actually move the EIPs
     * @param {Object} EIPConfig - EIP Configuration we should set
     *
     * @returns {Promise} - Resolves or rejects with status of moving the EIP
     */
    _reassociateEIPs(EIPConfig) {
        // const disassociatePromises = [];
        // const associatePromises = [];
        Object.keys(EIPConfig).forEach((eip) => {
            // disassociatePromises.push(util.retrier(this._disassociateIpAddress, eip.current.AssociationId));
            this.logger.info('going to disassociate:');
            this.logger.info(eip.current.AssociationId);
        });
    }

    _disassociateIpAddress(associationIdToDisassociate) {
        return new Promise((resolve, reject) => {
            this.logger.info('disassociating');
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

    _associateIpAddress() {

    }

    /**
     * _generateNewEIPConfigs();
     * @param privateInstanceIPs - IPs for this instance
     * // TODO: Not much thought here yet
     */
    _generateNewEIPConfigs(privateInstanceIPs) {
        const updatedState = {};
        this.eips.forEach((eip) => {
            // TODO: 'VIPS' should be a constant. Question: Should it be defined in the POST payload?
            // TODO: How does Terraform do tagging? Would this change how we'd set our tags?
            const targetAddresses = eip.Tags.find(tag => tag.Key === 'VIPS').Value.split(',');
            targetAddresses.forEach((targetAddr) => {
                this.logger.info('target:');
                this.logger.info(targetAddr);
                this.logger.info('IPs on instance:');
                this.logger.info(privateInstanceIPs);
                if (targetAddr in privateInstanceIPs) {
                    this.logger.info('found canditate to move!');
                    this.logger.info(`should move: ${eip.PublicIp} to ${targetAddr}, and off ${eip.PrivateIpAddress}`);
                    updatedState[eip.PublicIp] = {
                        target: {
                            PrivateIpAddress: targetAddr,
                            NetworkInterfaceId: privateInstanceIPs[targetAddr].NetworkInterfaceId
                        },
                        current: {
                            PrivateIpAddress: eip.PrivateIpAddress,
                            AssociationId: eip.AssociationId
                        },
                        allocationId: eip.allocationId
                    };
                }
            });
        });
        return updatedState;
    }

    /**
     * Get all Private Secondary IP addresses for this BIG-IP
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
