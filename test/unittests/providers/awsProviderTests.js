/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line import/no-extraneous-dependencies

const cloud = 'aws';

describe('Provider - AWS', () => {
    let AWSCloudProvider;
    let provider;
    let metadataPathRequest;

    const mockInitData = {
        tags: [
            {
                key: 'key1',
                value: 'value1'
            },
            {
                key: 'key2',
                value: 'value2'
            }
        ]
    };

    const mockMetadata = { region: 'us-west', instanceId: 'i-123' };

    before(() => {
        AWSCloudProvider = require('../../../src/nodejs/providers/aws/cloud.js').Cloud;
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });
    beforeEach(() => {
        provider = new AWSCloudProvider(mockInitData);

        provider.metadata.request = sinon.stub().callsFake((path, callback) => {
            metadataPathRequest = path;
            callback(null, JSON.stringify(mockMetadata));
        });
    });
    afterEach(() => {
        sinon.restore();
    });

    it('should validate constructor', () => {
        provider = new AWSCloudProvider(mockInitData);

        assert.strictEqual(provider.environment, cloud);
    });

    it('should initialize AWS provider', () => provider.init(mockInitData)
        .then(() => {
            assert.strictEqual(metadataPathRequest, '/latest/dynamic/instance-identity/document');
            assert.strictEqual(provider.region, mockMetadata.region);
            assert.strictEqual(provider.instanceId, mockMetadata.instanceId);
        })
        .catch(() => {
            assert.fail();
        }));

    it('should initialize EC2 client with updated region', () => provider.init(mockInitData)
        .then(() => {
            assert.strictEqual(provider.ec2.config.region, mockMetadata.region);
        }));

    /*
it('should call functions when updateAddresses is called', () => {
    let passedTags;
    provider._getElasticIPs = sinon.stub().callsFake((tags) => {
        passedTags = tags;
        Promise.resolve();
    });
    return provider.updateAddresses()
        .then(() => {
            assert.strictEqual(provider.ec2.region, mockMetadata.region);
        })
        .catch(() => {
            assert.fail();
        });
});
*/
    it('should get Elastic IPs from AWS', () => {
        let returnedParams;
        let mockedResult;

        return provider.init(mockInitData)
            .then(() => {
                provider.ec2.describeAddresses = sinon.stub().callsFake((params) => {
                    returnedParams = params;
                    // TODO: Can this be global?
                    mockedResult = {
                        Addresses: [
                            {
                                PublicIp: '1.2.3.4'
                            }
                        ]
                    };
                    return {
                        promise() {
                            return Promise.resolve(mockedResult);
                        }
                    };
                });
                return provider._getElasticIPs(mockInitData.tags);
            })
            .then((results) => {
                assert.deepEqual(results, mockedResult);
                assert.deepEqual(returnedParams, {
                    Filters: [
                        {
                            Name: 'tag:key1',
                            Values: ['value1']
                        },
                        {
                            Name: 'tag:key2',
                            Values: ['value2']
                        }
                    ]
                });
            })
            .catch(() => {
                assert.fail();
            });
    });

    describe('function _getPrivateSecondaryIPs', () => {
        const describeNetworkInterfacesResponse = {
            NetworkInterfaces: [
                {
                    NetworkInterfaceId: 'eni-123',
                    PrivateIpAddresses: [
                        {
                            Primary: true,
                            PrivateIpAddress: '1.2.3.4'
                        },
                        {
                            Primary: false,
                            PrivateIpAddress: '2.3.4.5'
                        }
                    ]
                },
                {
                    NetworkInterfaceId: 'eni-456',
                    PrivateIpAddresses: [
                        {
                            Primary: false,
                            PrivateIpAddress: '3.4.5.6'
                        }
                    ]
                }
            ]
        };
        it('should get Private Secondary IPs from AWS', () => provider.init(mockInitData)
            .then(() => {
                // eslint-disable-next-line arrow-body-style
                provider.ec2.describeNetworkInterfaces = sinon.stub().callsFake(() => {
                    return {
                        promise() {
                            return Promise.resolve(describeNetworkInterfacesResponse);
                        }
                    };
                });
                return provider._getPrivateSecondaryIPs();
            })
            .then((results) => {
                assert.deepEqual(results,
                    {
                        '2.3.4.5': {
                            NetworkInterfaceId: 'eni-123'
                        },
                        '3.4.5.6': {
                            NetworkInterfaceId: 'eni-456'
                        }
                    });
            })
            .catch(() => {
                assert.fail();
            }));

        it('should pass correct parameters', () => {
            let passedParams;
            return provider.init(mockInitData)
                .then(() => {
                    provider.ec2.describeNetworkInterfaces = sinon.stub().callsFake((params) => {
                        passedParams = params;
                        return {
                            promise() {
                                return Promise.resolve(describeNetworkInterfacesResponse);
                            }
                        };
                    });
                    return provider._getPrivateSecondaryIPs();
                })
                .then(() => {
                    assert.deepEqual(passedParams,
                        {
                            Filters: [
                                {
                                    Name: 'attachment.instance-id',
                                    Values: [mockMetadata.instanceId]
                                }
                            ]
                        });
                })
                .catch(() => {
                    assert.fail();
                });
        });
    });
});
