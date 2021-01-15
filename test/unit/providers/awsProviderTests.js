/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

/* eslint-disable global-require */

const assert = require('assert');
const sinon = require('sinon');

const cloud = 'aws';

describe('Provider - AWS', () => {
    let AWSCloudProvider;
    let provider;
    let metadataPathRequest;
    let originalgetS3BucketByTags;
    let originalgetAllS3Buckets;

    const mockInitData = {
        addressTags: {
            key1: 'value1',
            key2: 'value2'
        },
        routeGroupDefinitions: [
            {
                routeTags: {
                    F5_CLOUD_FAILOVER_LABEL: 'foo'
                },
                routeAddressRanges: [
                    {
                        routeAddresses: ['192.0.2.0/24']
                    }
                ]
            }
        ],
        storageTags: {
            sKey1: 'storageKey1'
        },
        proxySettings: {
            host: '1.1.1.1',
            password: '',
            port: '8080',
            protocol: 'http',
            username: ''
        }
    };

    const mockMetadata = {
        region: 'us-west',
        instanceId: 'i-123',
        storageName: 's3BucketName'
    };

    const _getPrivateSecondaryIPsStubResponse = {
        '2.3.4.5': {
            NetworkInterfaceId: 'eni-2345'
        },
        '3.4.5.6': {
            NetworkInterfaceId: 'eni-3456'
        },
        '4.5.6.7': {
            NetworkInterfaceId: 'eni-3456'
        }
    };

    const _generatePublicAddressOperationsStubResponse = {
        '1.1.1.1': {
            AllocationId: 'eipalloc-456',
            target: {
                NetworkInterfaceId: 'eni-2345',
                PrivateIpAddress: '2.3.4.5'
            },
            current: {
                AssociationId: 'eipassoc-123',
                PrivateIpAddress: '10.1.1.1'
            }
        },
        '2.2.2.2': {
            AllocationId: 'eipalloc-654',
            target: {
                NetworkInterfaceId: 'eni-3456',
                PrivateIpAddress: '3.4.5.6'
            },
            current: {
                AssociationId: 'eipassoc-321',
                PrivateIpAddress: '20.1.1.1'
            }
        }
    };

    const _s3FileParamsStub = {
        Body: 's3 state file body',
        Bucket: 'myfailoverbucket',
        Key: 'f5cloudfailover/file.json'
    };

    const _getElasticIPsStubResponse = {
        Addresses: [
            {
                PublicIp: '1.2.3.4'
            }
        ]
    };

    const targetBucket = 'bucket2';
    const _getAllS3BucketsStubResponse = [
        'bucket1',
        targetBucket,
        'bucket3'
    ];

    const listBucketsSubResponse = {
        Buckets: [
            { Name: _getAllS3BucketsStubResponse[0] },
            { Name: _getAllS3BucketsStubResponse[1] },
            { Name: _getAllS3BucketsStubResponse[2] }
        ],
        Owner: {
            Name: 'owner'
        }
    };

    const _getTagsStubResponse = {
        Bucket: targetBucket,
        TagSet: [{
            Key: 'sKey1',
            Value: 'storageKey1'
        }]
    };

    const genericAWSError = new Error('AWS vanished');

    before(() => {
        AWSCloudProvider = require('../../../src/nodejs/providers/aws/cloud.js').Cloud;
    });
    after(() => {
        Object.keys(require.cache)
            .forEach((key) => {
                delete require.cache[key];
            });
    });
    beforeEach(() => {
        provider = new AWSCloudProvider(mockInitData);

        provider.logger = sinon.stub();
        provider.logger.info = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.silly = sinon.stub();
        provider.logger.warning = sinon.stub();

        provider.maxRetries = 0;
        provider.retryInterval = 100;

        provider.metadata.request = sinon.stub()
            .callsFake((path, callback) => {
                metadataPathRequest = path;
                callback(null, JSON.stringify(mockMetadata));
            });
        originalgetS3BucketByTags = provider._getS3BucketByTags;
        provider._getS3BucketByTags = sinon.stub()
            .resolves(_s3FileParamsStub.Bucket);

        originalgetAllS3Buckets = provider._getAllS3Buckets;
        provider._getAllS3Buckets = sinon.stub()
            .resolves(_getAllS3BucketsStubResponse);
    });
    afterEach(() => {
        sinon.restore();
    });

    it('should validate constructor', () => {
        provider = new AWSCloudProvider(mockInitData);

        assert.strictEqual(provider.environment, cloud);
    });

    describe('AWS Provider initialization', () => {
        it('should initialize AWS provider', () => provider.init(mockInitData)
            .then(() => {
                assert.strictEqual(provider.region, mockMetadata.region);
                assert.strictEqual(provider.instanceId, mockMetadata.instanceId);
            })
            .catch(() => {
                assert.fail();
            }));

        it('should reject if error', () => {
            provider._getInstanceIdentityDoc = sinon.stub()
                .rejects(genericAWSError);
            return provider.init(mockInitData)
                .then(() => {
                    assert.ok(false, 'Should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, genericAWSError.message);
                });
        });

        it('should initialize if storageName is set then return bucket name', () => {
            provider.region = mockMetadata.region;
            provider.instanceId = mockMetadata.instanceId;
            provider.storageName = mockMetadata.storageName;

            return provider.init({ storageName: 's3BucketName' })
                .then(() => {
                    assert.strictEqual(provider.storageName, 's3BucketName');
                })
                .catch(err => Promise.reject(err));
        });

        describe('_getS3BucketByTags', () => {
            it('should return the tagged bucket', () => provider.init(mockInitData)
                .then(() => {
                    provider._getTags = sinon.stub()
                        .callsFake((bucket) => {
                            if (bucket === targetBucket) {
                                return Promise.resolve(_getTagsStubResponse);
                            }
                            return Promise.resolve();
                        });
                    provider._getS3BucketByTags = originalgetS3BucketByTags;
                    return provider._getS3BucketByTags(mockInitData.storageTags);
                })
                .then((response) => {
                    assert.strictEqual(response, targetBucket);
                })
                .catch(() => {
                    assert.fail();
                }));

            it('should reject if no buckets are found', () => provider.init(mockInitData)
                .then(() => {
                    provider._getTags = sinon.stub()
                        .resolves();
                    provider._getS3BucketByTags = originalgetS3BucketByTags;
                    return provider._getS3BucketByTags(mockInitData.storageTags);
                })
                .then(() => {
                    assert.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'No valid S3 Buckets found!');
                }));

            it('should reject if there is an error', () => provider.init(mockInitData)
                .then(() => {
                    provider._getAllS3Buckets = sinon.stub()
                        .rejects(genericAWSError);
                    provider._getS3BucketByTags = originalgetS3BucketByTags;
                    return provider._getS3BucketByTags(mockInitData.storageTags);
                })
                .then(() => {
                    assert.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, genericAWSError.message);
                }));

            it('should pass bucket names to _getTags()', () => {
                const passedParams = [];
                return provider.init(mockInitData)
                    .then(() => {
                        provider._getTags = sinon.stub()
                            .callsFake((params) => {
                                passedParams.push(params);
                                if (params === targetBucket) {
                                    return Promise.resolve(_getTagsStubResponse);
                                }
                                return Promise.resolve();
                            });
                        provider._getS3BucketByTags = originalgetS3BucketByTags;
                        return provider._getS3BucketByTags(mockInitData.storageTags);
                    })
                    .then(() => {
                        assert.deepEqual(passedParams, _getAllS3BucketsStubResponse);
                    })
                    .catch(() => {
                        assert.fail();
                    });
            });
        });

        describe('_getAllS3Buckets', () => {
            it('should return an array of bucket names', () => provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.s3.listBuckets = sinon.stub()
                        .callsFake(() => ({
                            promise() {
                                return Promise.resolve(listBucketsSubResponse);
                            }
                        }));
                    provider.s3.getBucketLocation = sinon.stub()
                        .callsFake(() => ({
                            promise() {
                                return Promise.resolve({ LocationConstraint: 'us' });
                            }
                        }));
                    provider._getAllS3Buckets = originalgetAllS3Buckets;
                    return provider._getAllS3Buckets();
                })
                .then((response) => {
                    assert.deepEqual(response, _getAllS3BucketsStubResponse);
                })
                .catch(() => {
                    assert.fail();
                }));

            it('should return an array of bucket names filtered by region', () => provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.s3.listBuckets = sinon.stub()
                        .callsFake(() => ({
                            promise() {
                                return Promise.resolve(listBucketsSubResponse);
                            }
                        }));
                    provider.region = 'us';
                    const getBucketLocationStub = sinon.stub();
                    getBucketLocationStub.onCall(0)
                        .callsFake(() => ({
                            promise() {
                                return Promise.resolve({ LocationConstraint: 'ca' });
                            }
                        }));
                    getBucketLocationStub.onCall(1)
                        .callsFake(() => ({
                            promise() {
                                return Promise.resolve({ LocationConstraint: 'ca' });
                            }
                        }));
                    getBucketLocationStub.onCall(2)
                        .callsFake(() => ({
                            promise() {
                                return Promise.resolve({ LocationConstraint: 'us' });
                            }
                        }));
                    provider.s3.getBucketLocation = getBucketLocationStub;
                    provider._getAllS3Buckets = originalgetAllS3Buckets;
                    return provider._getAllS3Buckets();
                })
                .then((response) => {
                    assert.deepEqual(response, [_getAllS3BucketsStubResponse[2]]);
                })
                .catch(() => {
                    assert.fail();
                }));
        });

        describe('_getTags', () => {
            it('should resolve on error if continueOnError is provided', () => provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.s3.getBucketTagging = sinon.stub()
                        .callsFake(() => ({
                            promise() {
                                return Promise.reject();
                            }
                        }));
                    return provider._getTags(targetBucket, { continueOnError: true });
                })
                .then(() => {
                    assert.ok(true);
                })
                .catch(() => {
                    assert.ok(false, 'Should have not rejected');
                }));

            it('should reject on error if not continueOnError', () => provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.s3.getBucketTagging = sinon.stub()
                        .callsFake(() => ({
                            promise() {
                                return Promise.reject(genericAWSError);
                            }
                        }));
                    return provider._getTags(targetBucket, { continueOnError: false });
                })
                .then(() => {
                    assert.ok(false, 'Should have thrown an error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'AWS vanished');
                }));

            it('should pass correct parameters to getBucketTagging()', () => {
                let passedParams;
                return provider.init(mockInitData)
                    .then(() => {
                        provider.s3.getBucketTagging = sinon.stub()
                            .callsFake((params) => {
                                passedParams = params;
                                return {
                                    promise() {
                                        return Promise.resolve(_getTagsStubResponse);
                                    }
                                };
                            });
                        return provider._getTags(targetBucket);
                    })
                    .then((response) => {
                        assert.strictEqual(passedParams.Bucket, _getTagsStubResponse.Bucket);
                        assert.deepEqual(response, _getTagsStubResponse);
                    })
                    .catch(() => {
                        assert.fail();
                    });
            });
        });
    });

    describe('function _getInstanceIdentityDoc', () => {
        it('should call _getInstanceIdentityDoc to get instance data', () => provider._getInstanceIdentityDoc()
            .then(() => {
                assert.strictEqual(metadataPathRequest, '/latest/dynamic/instance-identity/document');
            })
            .catch(() => {
                assert.fail();
            }));

        it('should reject upon error', () => {
            const expectedError = 'cannot contact AWS metadata service';
            return provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.metadata.request = sinon.stub()
                        .callsFake((path, callback) => {
                            callback(new Error(expectedError, null));
                        });
                    return provider._getInstanceIdentityDoc();
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                });
        });
    });

    it('should initialize EC2 client with updated region', () => provider.init(mockInitData)
        .then(() => {
            assert.strictEqual(provider.ec2.config.region, mockMetadata.region);
        }));

    describe('function _getElasticIPs', () => {
        it('should get Elastic IPs from AWS', () => {
            let returnedParams;

            return provider.init(mockInitData)
                .then(() => {
                    provider.ec2.describeAddresses = sinon.stub()
                        .callsFake((params) => {
                            returnedParams = params;
                            return {
                                promise() {
                                    return Promise.resolve(_getElasticIPsStubResponse);
                                }
                            };
                        });
                    return provider._getElasticIPs({ tags: mockInitData.addressTags });
                })
                .then((results) => {
                    assert.deepEqual(results, _getElasticIPsStubResponse);
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
                .catch((err) => {
                    assert.fail(err);
                });
        });

        it('should reject upon error', () => {
            const expectedError = 'cannot describe the EIP adddresses';
            return provider.init(mockInitData)
                .then(() => {
                    provider.ec2.describeAddresses = sinon.stub()
                        .callsFake(() => ({
                            promise() {
                                return Promise.reject(new Error(expectedError));
                            }
                        }));
                    return provider._getElasticIPs(mockInitData.addressTags);
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                });
        });
    });

    describe('function _getPrivateSecondaryIPs', () => {
        const describeNetworkInterfacesResponse = {
            NetworkInterfaces: [
                {
                    NetworkInterfaceId: 'eni-2345',
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
                    NetworkInterfaceId: 'eni-3456',
                    PrivateIpAddresses: [
                        {
                            Primary: false,
                            PrivateIpAddress: '3.4.5.6'
                        },
                        {
                            Primary: false,
                            PrivateIpAddress: '4.5.6.7'
                        }
                    ]
                }
            ]
        };
        it('should get Private Secondary IPs from AWS', () => provider.init(mockInitData)
            .then(() => {
                provider.ec2.describeNetworkInterfaces = sinon.stub()
                    .callsFake(() => ({
                        promise() {
                            return Promise.resolve(describeNetworkInterfacesResponse);
                        }
                    }));
                return provider._getPrivateSecondaryIPs();
            })
            .then((results) => {
                assert.deepEqual(results, _getPrivateSecondaryIPsStubResponse);
            })
            .catch(() => {
                assert.fail();
            }));

        it('should pass correct parameters', () => {
            let passedParams;
            return provider.init(mockInitData)
                .then(() => {
                    provider.ec2.describeNetworkInterfaces = sinon.stub()
                        .callsFake((params) => {
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

        it('should reject upon error', () => {
            const expectedError = 'cannot describe the Network Interfaces';
            return provider.init(mockInitData)
                .then(() => {
                    provider.ec2.describeNetworkInterfaces = sinon.stub()
                        .callsFake(() => ({
                            promise() {
                                return Promise.reject(new Error(expectedError));
                            }
                        }));
                    return provider._getPrivateSecondaryIPs();
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                });
        });
    });
    describe('function _generatePublicAddressOperations', () => {
        const EIPdata = [
            {
                Tags: [
                    {
                        Key: 'f5_cloud_failover_vips',
                        Value: '2.3.4.5,2.3.4.6,2.3.4.7'
                    }
                ],
                PublicIp: '1.1.1.1',
                PrivateIpAddress: '10.1.1.1',
                AssociationId: 'eipassoc-123',
                AllocationId: 'eipalloc-456'
            },
            {
                Tags: [
                    {
                        Key: 'f5_cloud_failover_vips',
                        Value: '3.4.5.6,3.4.5.7,3.4.5.8'
                    }
                ],
                PublicIp: '2.2.2.2',
                PrivateIpAddress: '20.1.1.1',
                AssociationId: 'eipassoc-321',
                AllocationId: 'eipalloc-654'
            }
        ];

        it('should return correct Elastic IP configuration', () => provider.init(mockInitData)
            .then(() => provider._generatePublicAddressOperations(EIPdata, _getPrivateSecondaryIPsStubResponse))
            .then((results) => {
                assert.deepEqual(results, _generatePublicAddressOperationsStubResponse);
            })
            .catch(() => {
                assert.fail();
            }));
    });
    describe('function _associatePublicAddress', () => {
        const allocationId = 'eipalloc-0b5671ebba3628edd';
        const networkInterfaceId = 'eni-0157ac0f9506af78b';
        const privateIpAddress = '10.0.1.11';

        let passedParams;

        it('should pass correct parameters to AWS call', () => provider.init(mockInitData)
            .then(() => {
                provider.ec2.associateAddress = sinon.stub()
                    .callsFake((params) => {
                        passedParams = params;
                        return {
                            promise() {
                                return Promise.resolve();
                            }
                        };
                    });
                return provider._associatePublicAddress(allocationId, networkInterfaceId, privateIpAddress);
            })
            .then(() => {
                assert.deepEqual(passedParams, {
                    AllocationId: allocationId,
                    NetworkInterfaceId: networkInterfaceId,
                    PrivateIpAddress: privateIpAddress,
                    AllowReassociation: true
                });
            })
            .catch(() => {
                assert.fail();
            }));

        it('should reject upon error', () => {
            const expectedError = 'cannot associate Elastic IP';
            return provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider.ec2.associateAddress = sinon.stub()
                        .callsFake(() => ({
                            promise() {
                                return Promise.reject(new Error(expectedError));
                            }
                        }));
                    return provider._associatePublicAddress();
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                });
        });
    });
    describe('function _disassociatePublicAddress', () => {
        let passedParams;
        const associationIdToDisassociate = 'eipassoc-00523b2b8b8c01793';

        it('should pass correct parameters to AWS call', () => provider.init(mockInitData)
            .then(() => {
                provider.ec2.disassociateAddress = sinon.stub()
                    .callsFake((params) => {
                        passedParams = params;
                        return {
                            promise() {
                                return Promise.resolve();
                            }
                        };
                    });
                return provider._disassociatePublicAddress(associationIdToDisassociate);
            })
            .then(() => {
                assert.deepEqual(passedParams, {
                    AssociationId: associationIdToDisassociate
                });
            })
            .catch(() => {
                assert.fail();
            }));
    });
    describe('function _reassociatePublicAddresses', () => {
        it('should call _disassociatePublicAddress with correct params', () => {
            const passedParams = [];
            return provider.init(mockInitData)
                .then(() => {
                    provider._disassociatePublicAddress = sinon.stub()
                        .callsFake((params) => {
                            passedParams.push(params);
                            return Promise.resolve();
                        });
                    provider._associatePublicAddress = sinon.stub()
                        .resolves();

                    return provider._reassociatePublicAddresses(_generatePublicAddressOperationsStubResponse);
                })
                .then(() => {
                    assert.deepEqual(passedParams, ['eipassoc-123', 'eipassoc-321']);
                    assert.strictEqual(passedParams.length, 2);
                })
                .catch(() => {
                    assert.fail();
                });
        });

        it('should call _associatePublicAddress with correct params', () => {
            const passedParams = [];
            return provider.init(mockInitData)
                .then(() => {
                    provider._disassociatePublicAddress = sinon.stub()
                        .resolves();
                    provider._associatePublicAddress = sinon.stub()
                        .callsFake(
                            (allocationId, networkInterfaceId, privateIpAddress) => {
                                passedParams.push({
                                    allocationId,
                                    networkInterfaceId,
                                    privateIpAddress
                                });
                                return Promise.resolve();
                            }
                        );

                    return provider._reassociatePublicAddresses(_generatePublicAddressOperationsStubResponse);
                })
                .then(() => {
                    assert.deepEqual(passedParams, [
                        {
                            allocationId: 'eipalloc-456',
                            networkInterfaceId: 'eni-2345',
                            privateIpAddress: '2.3.4.5'
                        },
                        {
                            allocationId: 'eipalloc-654',
                            networkInterfaceId: 'eni-3456',
                            privateIpAddress: '3.4.5.6'
                        }
                    ]);
                    assert.strictEqual(passedParams.length, 2);
                })
                .catch(() => {
                    assert.fail();
                });
        });

        it('should not reject if there is no work to do', () => provider.init(mockInitData)
            .then(() => provider._reassociatePublicAddresses([]))
            .then(() => {
                assert.ok(true);
            })
            .catch(() => {
                assert.fail();
            }));
    });

    describe('function updateAddress', () => {
        let actualParams;

        const nicsTagSet = [
            {
                Key: 'f5_cloud_failover_nic_map',
                Value: 'external'
            }
        ];
        const localAddresses = ['1.2.3.4'];
        const failoverAddresses = ['10.10.10.10', '10.10.10.11', '2600:1f14:92a:bc03:8459:976:1950:32a2'];

        beforeEach(() => {
            actualParams = {
                assign: {
                    private: [],
                    public: []
                },
                unassign: {
                    private: [],
                    public: []
                }
            };
            return provider.init(mockInitData)
                .then(() => {
                    provider.ec2.unassignPrivateIpAddresses = sinon.stub()
                        .callsFake((params) => {
                            actualParams.unassign.private.push(params);
                            return {
                                promise() {
                                    return Promise.resolve();
                                }
                            };
                        });
                    provider.ec2.assignPrivateIpAddresses = sinon.stub()
                        .callsFake((params) => {
                            actualParams.assign.private.push(params);
                            return {
                                promise() {
                                    return Promise.resolve();
                                }
                            };
                        });
                    provider.ec2.disassociateAddress = sinon.stub()
                        .callsFake((params) => {
                            actualParams.unassign.public.push(params);
                            return {
                                promise() {
                                    return Promise.resolve();
                                }
                            };
                        });
                    provider.ec2.associateAddress = sinon.stub()
                        .callsFake((params) => {
                            actualParams.assign.public.push(params);
                            return {
                                promise() {
                                    return Promise.resolve();
                                }
                            };
                        });
                })
                .catch(err => Promise.reject(err));
        });

        it('should not throw error if update operations is empty', () => {
            const opts = { updateOperations: {} };
            return provider.updateAddresses(opts)
                .catch(err => Promise.reject(err));
        });

        it('should validate private+public address gets reassociated', () => {
            const describeNetworkInterfacesResponse = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-1',
                        PrivateIpAddresses: [
                            {
                                Primary: true,
                                PrivateIpAddress: '1.2.3.4'
                            }
                        ],
                        TagSet: nicsTagSet
                    },
                    {
                        NetworkInterfaceId: 'eni-2',
                        PrivateIpAddresses: [
                            {
                                Primary: true,
                                PrivateIpAddress: '1.2.3.5'
                            },
                            {
                                Primary: false,
                                PrivateIpAddress: '10.10.10.10',
                                Association: {
                                    PublicIp: '2.2.2.2'
                                }
                            },
                            {
                                Primary: false,
                                PrivateIpAddress: '10.10.10.11',
                                Association: {}
                            }
                        ],
                        TagSet: nicsTagSet
                    }
                ]
            };
            const describeAddressesResponse = {
                Addresses: [
                    {
                        PublicIp: '2.2.2.2',
                        AssociationId: 'association-id',
                        AllocationId: 'allocation-id',
                        Tags: []
                    }
                ]
            };
            provider.ec2.describeAddresses = sinon.stub()
                .returns({
                    promise() {
                        return Promise.resolve(describeAddressesResponse);
                    }
                });
            provider.ec2.describeNetworkInterfaces = sinon.stub()
                .returns({
                    promise() {
                        return Promise.resolve(describeNetworkInterfacesResponse);
                    }
                });

            return provider.updateAddresses({ localAddresses, failoverAddresses })
                .then(() => {
                    // assert correct unassign/assign call count
                    assert.strictEqual(actualParams.unassign.private.length, 1);
                    assert.strictEqual(actualParams.assign.private.length, 1);
                    assert.strictEqual(actualParams.assign.public.length, 1);

                    // assert private address gets reassociated properly
                    assert.deepStrictEqual(actualParams.unassign.private, [{ NetworkInterfaceId: 'eni-2', PrivateIpAddresses: ['10.10.10.11', '10.10.10.10'] }]);
                    assert.deepStrictEqual(actualParams.assign.private, [{ NetworkInterfaceId: 'eni-1', PrivateIpAddresses: ['10.10.10.11', '10.10.10.10'] }]);
                    // assert public address gets reassociated properly
                    assert.deepStrictEqual(actualParams.unassign.public, [{ AssociationId: 'association-id' }]);
                    assert.deepStrictEqual(actualParams.assign.public, [{
                        AllocationId: 'allocation-id',
                        NetworkInterfaceId: 'eni-1',
                        PrivateIpAddress: '10.10.10.10',
                        AllowReassociation: true
                    }]);
                })
                .catch(err => Promise.reject(err));
        });

        // validate
        ['f5_cloud_failover_vips', 'VIPS'].forEach((vipTagName) => {
            it(`should validate public address gets reassociated (using ${vipTagName} tag)`, () => {
                const describeAddressesResponse = {
                    Addresses: [
                        {
                            PublicIp: '2.2.2.2',
                            PrivateIpAddress: '10.10.10.11',
                            AssociationId: 'association-id',
                            AllocationId: 'allocation-id',
                            Tags: [
                                {
                                    Key: vipTagName,
                                    Value: '10.10.10.10,10.10.10.11'
                                }
                            ]
                        }
                    ]
                };
                const describeNetworkInterfacesResponse = {
                    NetworkInterfaces: [
                        {
                            NetworkInterfaceId: 'eni-1',
                            PrivateIpAddresses: [
                                {
                                    Primary: false,
                                    PrivateIpAddress: '10.10.10.10'
                                }
                            ],
                            TagSet: []
                        },
                        {
                            NetworkInterfaceId: 'eni-2',
                            PrivateIpAddresses: [
                                {
                                    Primary: false,
                                    PrivateIpAddress: '10.10.10.100'
                                }
                            ],
                            TagSet: []
                        }
                    ]
                };
                provider.ec2.describeAddresses = sinon.stub()
                    .returns({
                        promise() {
                            return Promise.resolve(describeAddressesResponse);
                        }
                    });
                provider.ec2.describeNetworkInterfaces = sinon.stub()
                    .returns({
                        promise() {
                            return Promise.resolve(describeNetworkInterfacesResponse);
                        }
                    });

                return provider.updateAddresses({ discoverOnly: true })
                    .then(operations => provider.updateAddresses({ updateOperations: operations }))
                    .then(() => {
                        // assert public address gets reassociated properly
                        assert.deepStrictEqual(actualParams.unassign.public, [{ AssociationId: 'association-id' }]);
                        assert.deepStrictEqual(actualParams.assign.public, [{
                            AllocationId: 'allocation-id',
                            NetworkInterfaceId: 'eni-1',
                            PrivateIpAddress: '10.10.10.10',
                            AllowReassociation: true
                        }]);
                    })
                    .catch(err => Promise.reject(err));
            });
        });
    });

    describe('function discoverAddressOperationsUsingDefinitions', () => {
        const addresses = {
            localAddresses: ['1.2.3.4'],
            failoverAddresses: ['10.10.10.10', '10.10.10.11', '2600:1f14:92a:bc03:8459:976:1950:32a2']
        };
        const options = {};
        it('should validate same-net case', () => {
            const describeAddressesResponse = {
                Addresses: [
                    {
                        PublicIp: '2.2.2.2',
                        PrivateIpAddress: '10.10.10.10',
                        AssociationId: 'association-id',
                        AllocationId: 'allocation-id',
                        Tags: []
                    }
                ],
                Tags: []
            };
            const describeNetworkInterfacesResponse = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-000001',
                        PrivateIpAddresses: [
                            {
                                Primary: true,
                                PrivateIpAddress: '1.2.3.4'
                            }
                        ],
                        TagSet: []
                    },
                    {
                        NetworkInterfaceId: 'eni-000002',
                        PrivateIpAddresses: [
                            {
                                Primary: true,
                                PrivateIpAddress: '1.2.3.5'
                            },
                            {
                                Primary: false,
                                PrivateIpAddress: '10.10.10.10',
                                Association: {
                                    PublicIp: '2.2.2.2'
                                }
                            },
                            {
                                Primary: false,
                                PrivateIpAddress: '10.10.10.11',
                                Association: {}
                            }
                        ],
                        TagSet: []
                    }
                ],
                Tags: []
            };
            const addressGroupDefinitions = [
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '2.2.2.2',
                    networkInterfaces: [
                        'eni-000001',
                        'eni-000002'
                    ]
                }
            ];
            provider.ec2.describeAddresses = sinon.stub()
                .callsFake(() => ({
                    promise() {
                        return Promise.resolve(describeAddressesResponse);
                    }
                }));
            provider.ec2.describeNetworkInterfaces = sinon.stub()
                .returns({
                    promise() {
                        return Promise.resolve(describeNetworkInterfacesResponse);
                    }
                });
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                    assert.strictEqual(JSON.stringify(response.loadBalancerAddresses), JSON.stringify({}));
                    assert.strictEqual(response.interfaces.disassociate[0].networkInterfaceId, 'eni-000002');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[0].address, '10.10.10.11');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[0].publicAddress, undefined);
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[0].ipVersion, 4);
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[1].address, '10.10.10.10');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[1].publicAddress, '2.2.2.2');
                    assert.strictEqual(response.interfaces.associate[0].networkInterfaceId, 'eni-000001');
                    assert.strictEqual(response.interfaces.associate[0].addresses[0].address, '10.10.10.11');
                    assert.strictEqual(response.interfaces.associate[0].addresses[0].ipVersion, 4);
                    assert.strictEqual(response.interfaces.associate[0].addresses[0].publicAddress, undefined);
                    assert.strictEqual(response.interfaces.associate[0].addresses[1].address, '10.10.10.10');
                    assert.strictEqual(response.interfaces.associate[0].addresses[1].ipVersion, 4);
                    assert.strictEqual(response.interfaces.associate[0].addresses[1].publicAddress, '2.2.2.2');
                })
                .catch(err => assert.fail(err));
        });

        it('should validate across-net case', () => {
            provider.addressTags = {
                f5_cloud_failover_label: 'foo'
            };
            const addressGroupDefinitions = [
                {
                    type: 'elasticIpAddress',
                    scopingAddress: '2.2.2.2',
                    vipAddresses: [
                        '10.10.10.10',
                        '10.10.10.100'
                    ]
                }
            ];
            const describeAddressesResponse = {
                Addresses: [
                    {
                        PublicIp: '2.2.2.2',
                        PrivateIpAddress: '10.10.10.10',
                        AssociationId: 'association-id',
                        AllocationId: 'allocation-id',
                        Tags: []
                    }
                ],
                Tags: []
            };
            const describeNetworkInterfacesResponse = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-000002',
                        PrivateIpAddresses: [
                            {
                                Primary: false,
                                PrivateIpAddress: '10.10.10.100'
                            }
                        ],
                        TagSet: []
                    }
                ]
            };
            provider.ec2.describeAddresses = sinon.stub()
                .callsFake(() => ({
                    promise() {
                        return Promise.resolve(describeAddressesResponse);
                    }
                }));
            provider.ec2.describeNetworkInterfaces = sinon.stub()
                .returns({
                    promise() {
                        return Promise.resolve(describeNetworkInterfacesResponse);
                    }
                });
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].current.PrivateIpAddress, '10.10.10.10');
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].current.AssociationId, 'association-id');
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].target.PrivateIpAddress, '10.10.10.100');
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].target.NetworkInterfaceId, 'eni-000002');
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].AllocationId, 'allocation-id');
                })
                .catch(() => assert.fail());
        });

        it('across-net addressGroupDefinitions vipAddress are empty', () => {
            const addressGroupDefinitions = [
                {
                    type: 'elasticIpAddress',
                    scopingAddress: '2.2.2.2',
                    vipAddresses: []
                }
            ];
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                })
                .catch(() => assert.fail());
        });

        it('across-net publicIp not found', () => {
            const addressGroupDefinitions = [
                {
                    type: 'elasticIpAddress',
                    scopingAddress: '2.2.2.2',
                    vipAddresses: [
                        '10.10.10.10',
                        '10.10.10.100'
                    ]
                }
            ];
            provider.ec2.describeAddresses = sinon.stub()
                .callsFake(() => ({
                    promise() {
                        return Promise.resolve({});
                    }
                }));
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                })
                .catch(() => assert.fail());
        });

        it('across-net publicIp metadata is undefined', () => {
            const addressGroupDefinitions = [
                {
                    type: 'elasticIpAddress',
                    scopingAddress: '2.2.2.2',
                    vipAddresses: [
                        '10.10.10.10',
                        '10.10.10.100'
                    ]
                }
            ];
            provider.ec2.describeAddresses = sinon.stub()
                .callsFake(() => ({
                    promise() {
                        return Promise.resolve(undefined);
                    }
                }));
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                })
                .catch(() => assert.fail());
        });

        it('across-net publicIp has not private address association', () => {
            const addressGroupDefinitions = [
                {
                    type: 'elasticIpAddress',
                    scopingAddress: '2.2.2.2',
                    vipAddresses: [
                        '10.10.10.10',
                        '10.10.10.100'
                    ]
                }
            ];
            provider.ec2.describeAddresses = sinon.stub()
                .callsFake(() => ({
                    promise() {
                        return Promise.resolve({
                            Addresses: [
                                {
                                    PublicIp: '2.2.2.2'
                                }
                            ]
                        });
                    }
                }));
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                })
                .catch(() => assert.fail());
        });

        it('across-net publicIp includes private address which is not under vipAddresses', () => {
            const addressGroupDefinitions = [
                {
                    type: 'elasticIpAddress',
                    scopingAddress: '2.2.2.2',
                    vipAddresses: [
                        '10.10.10.10',
                        '10.10.10.100'
                    ]
                }
            ];
            provider.ec2.describeAddresses = sinon.stub()
                .callsFake(() => ({
                    promise() {
                        return Promise.resolve({
                            Addresses: [
                                {
                                    PublicIp: '2.2.2.2',
                                    PrivateIpAddress: '10.0.0.1'
                                }
                            ]
                        });
                    }
                }));
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, options)
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                })
                .catch(() => assert.fail());
        });
    });

    describe('function uploadDataToStorage', () => {
        let passedParams;

        it('should pass correct params to putObject', () => provider.init(mockInitData)
            .then(() => {
                provider.s3BucketName = 'myfailoverbucket';

                provider.s3.putObject = sinon.stub()
                    .callsFake((params) => {
                        passedParams = params;
                        return {
                            promise() {
                                return Promise.resolve();
                            }
                        };
                    });
                return provider.uploadDataToStorage('file.json', _s3FileParamsStub.Body);
            })
            .then(() => {
                assert.deepEqual(passedParams, _s3FileParamsStub);
            })
            .catch(() => {
                assert.fail();
            }));
    });

    describe('function downloadDataFromStorage', () => {
        let passedParams;
        const mockResponseBody = { foo: 'bar' };
        const mockObjectBody = {
            Body: Buffer.from(JSON.stringify(mockResponseBody))
        };

        it('should pass correct params to downloadObject', () => provider.init(mockInitData)
            .then(() => {
                provider.s3BucketName = 'myfailoverbucket';

                provider.s3.listObjectsV2 = sinon.stub()
                    .callsFake(() => {
                        const response = { Contents: ['foo'] };
                        return {
                            promise() {
                                return Promise.resolve(response);
                            }
                        };
                    });
                provider.s3.getObject = sinon.stub()
                    .callsFake((params) => {
                        passedParams = params;
                        return {
                            promise() {
                                return Promise.resolve(mockObjectBody);
                            }
                        };
                    });
                return provider.downloadDataFromStorage('file.json');
            })
            .then((data) => {
                assert.strictEqual(passedParams.Bucket, _s3FileParamsStub.Bucket);
                assert.strictEqual(passedParams.Key, _s3FileParamsStub.Key);
                assert.deepStrictEqual(data, mockResponseBody);
            })
            .catch(err => Promise.reject(err)));

        it('should return empty object if listObjects is empty', () => provider.init(mockInitData)
            .then(() => {
                provider.s3BucketName = 'myfailoverbucket';

                provider.s3.listObjectsV2 = sinon.stub()
                    .callsFake(() => {
                        const response = { Contents: [] };
                        return {
                            promise() {
                                return Promise.resolve(response);
                            }
                        };
                    });
                return provider.downloadDataFromStorage('file.json');
            })
            .then((data) => {
                assert.deepStrictEqual(data, {});
            })
            .catch(err => Promise.reject(err)));
    });

    describe('function updateRoutes should', () => {
        const localAddresses = ['10.0.1.211'];

        beforeEach(() => {
            const routeTable = {
                RouteTableId: 'rtb-123',
                Routes: [
                    // IPv4
                    {
                        DestinationCidrBlock: '192.0.2.0/24',
                        InstanceId: 'i-123',
                        InstanceOwnerId: '123',
                        NetworkInterfaceId: 'eni-123',
                        Origin: 'CreateRoute',
                        State: 'active'
                    },
                    {
                        DestinationCidrBlock: '192.0.2.1/24',
                        InstanceId: 'i-123',
                        InstanceOwnerId: '123',
                        NetworkInterfaceId: 'eni-123',
                        Origin: 'CreateRoute',
                        State: 'active'
                    },
                    // IPv6
                    {
                        DestinationIpv6CidrBlock: '::/0',
                        InstanceId: 'i-123',
                        InstanceOwnerId: '123',
                        NetworkInterfaceId: 'eni-123',
                        Origin: 'CreateRoute',
                        State: 'active'
                    },
                    // "extra route"
                    {
                        DestinationCidrBlock: '10.0.0.0/16',
                        GatewayId: 'local',
                        Origin: 'CreateRoute',
                        State: 'active'
                    }
                ],
                Tags: [
                    {
                        Key: 'F5_CLOUD_FAILOVER_LABEL',
                        Value: 'foo'
                    },
                    {
                        Key: 'F5_SELF_IPS',
                        Value: '10.0.1.211, 10.0.11.52'
                    }
                ]
            };
            const describeNetworkInterfacesResponse = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-345'
                    }
                ]
            };

            const thisMockInitData = mockInitData;
            thisMockInitData.routeGroupDefinitions[0].routeAddressRanges[0].routeNextHopAddresses = {
                type: 'routeTag',
                tag: 'F5_SELF_IPS'
            };


            return provider.init(thisMockInitData)
                .then(() => {
                    provider.ec2.describeNetworkInterfaces = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve(describeNetworkInterfacesResponse);
                            }
                        });
                    provider.ec2.describeRouteTables = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve({ RouteTables: [routeTable] });
                            }
                        });
                    provider.ec2.replaceRoute = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve({});
                            }
                        });
                })
                .catch(err => Promise.reject(err));
        });

        it('should not throw error if update operations is empty', () => {
            const opts = { updateOperations: {} };
            return provider.updateRoutes(opts)
                .catch(err => Promise.reject(err));
        });

        it('update routes using next hop discovery method: routeTag', () => provider.updateRoutes({
            localAddresses,
            discoverOnly: true
        })
            .then(operations => provider.updateRoutes({ updateOperations: operations }))
            .then(() => {
                assert(provider.ec2.replaceRoute.calledOnce);
                assert(provider.ec2.replaceRoute.calledWith({
                    DestinationCidrBlock: '192.0.2.0/24',
                    NetworkInterfaceId: 'eni-345',
                    RouteTableId: 'rtb-123'
                }));
            })
            .catch(err => Promise.reject(err)));

        it('not update routes if matching route is not found', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges[0].routeAddresses = ['192.0.100.0/24'];

            return provider.updateRoutes({ localAddresses })
                .then(() => {
                    assert(provider.ec2.replaceRoute.notCalled);
                })
                .catch(err => Promise.reject(err));
        });

        it('update routes using next hop discovery method: static', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges[0] = {
                routeAddresses: ['192.0.2.0/24'],
                routeNextHopAddresses: {
                    type: 'static',
                    items: ['10.0.1.211', '10.0.11.52']
                }
            };

            return provider.updateRoutes({ localAddresses })
                .then(() => {
                    assert(provider.ec2.replaceRoute.calledOnce);
                    assert(provider.ec2.replaceRoute.calledWith({
                        DestinationCidrBlock: '192.0.2.0/24',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123'
                    }));
                })
                .catch(err => Promise.reject(err));
        });

        it('update routes using multiple next hop discovery method: static', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges = [
                {
                    routeAddresses: ['192.0.2.0/24'],
                    routeNextHopAddresses: {
                        type: 'static',
                        items: ['10.0.1.211', '10.0.11.52']
                    }
                },
                {
                    routeAddresses: ['::/0'],
                    routeNextHopAddresses: {
                        type: 'static',
                        items: ['2600:1f13:12f:a803:5d15:e0e:1af9:8221', '2600:1f13:12f:a804:5d15:e0e:1af9:8222']

                    }
                },
                {
                    routeAddresses: ['192.0.2.1/24'],
                    routeNextHopAddresses: {
                        type: 'static',
                        items: ['10.0.1.211', '10.0.11.52']
                    }
                }
            ];

            return provider.updateRoutes({ localAddresses: ['10.0.1.211', '2600:1f13:12f:a803:5d15:e0e:1af9:8221'] })
                .then(() => {
                    assert(provider.ec2.describeNetworkInterfaces.calledThrice);
                    assert(provider.ec2.describeNetworkInterfaces.args[0][0].Filters[2].Name === 'private-ip-address');
                    assert(provider.ec2.describeNetworkInterfaces.args[1][0].Filters[2].Name === 'private-ip-address');
                    assert(provider.ec2.describeNetworkInterfaces.args[2][0].Filters[2].Name === 'ipv6-addresses.ipv6-address');
                    assert(provider.ec2.replaceRoute.calledThrice);
                    assert(provider.ec2.replaceRoute.calledWith({
                        DestinationCidrBlock: '192.0.2.0/24',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123'
                    }));
                    assert(provider.ec2.replaceRoute.calledWith({
                        DestinationIpv6CidrBlock: '::/0',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123'
                    }));
                    assert(provider.ec2.replaceRoute.calledWith({
                        DestinationCidrBlock: '192.0.2.1/24',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123'
                    }));
                })
                .catch(err => Promise.reject(err));
        });

        it('update routes using next hop discovery method: static using IPv6 next hop IP addresses', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges = [
                {
                    routeAddresses: ['::/0'],
                    routeNextHopAddresses: {
                        type: 'static',
                        items: ['2600:1f13:12f:a803:5d15:e0e:1af9:8221', '2600:1f13:12f:a804:5d15:e0e:1af9:8222']
                    }
                }];
            return provider.updateRoutes({ localAddresses: ['2600:1f13:12f:a803:5d15:e0e:1af9:8221'] })
                .then(() => {
                    assert(provider.ec2.replaceRoute.calledOnce);
                    assert(provider.ec2.replaceRoute.calledWith({
                        DestinationIpv6CidrBlock: '::/0',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123'
                    }));
                })
                .catch(err => Promise.reject(err));
        });

        it('update routes using next hop discovery method: static (with retries)', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges[0] = {
                routeAddresses: ['192.0.2.0/24'],
                routeNextHopAddresses: {
                    type: 'static',
                    items: ['10.0.1.211', '10.0.11.52']
                }
            };
            provider.ec2.replaceRoute = sinon.stub();
            provider.ec2.replaceRoute
                .onCall(0)
                .returns({
                    promise() {
                        return Promise.reject(new Error('Request limit exceeded'));
                    }
                });
            provider.ec2.replaceRoute
                .returns({
                    promise() {
                        return Promise.resolve({});
                    }
                });
            provider.maxRetries = 10;

            return provider.updateRoutes({ localAddresses })
                .then(() => {
                    assert(provider.ec2.replaceRoute.calledTwice);
                    assert(provider.ec2.replaceRoute.calledWith({
                        DestinationCidrBlock: '192.0.2.0/24',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123'
                    }));
                })
                .catch(err => Promise.reject(err));
        });

        it('update routes using route name', () => {
            provider.routeGroupDefinitions = [
                {
                    routeName: 'rtb-123',
                    routeAddressRanges: [
                        {
                            routeAddresses: ['192.0.2.0/24'],
                            routeNextHopAddresses: {
                                type: 'static',
                                items: ['10.0.1.211', '10.0.11.52']
                            }
                        }
                    ]
                }
            ];

            return provider.updateRoutes({ localAddresses })
                .then(() => {
                    assert(provider.ec2.replaceRoute.calledOnce);
                    assert(provider.ec2.replaceRoute.calledWith({
                        DestinationCidrBlock: '192.0.2.0/24',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123'
                    }));
                })
                .catch(err => Promise.reject(err));
        });

        it('not update routes when matching next hop address is not found', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges[0] = {
                routeAddresses: ['::/0'],
                routeNextHopAddresses: {
                    type: 'static',
                    items: []
                }
            };

            return provider.updateRoutes({ localAddresses })
                .then(() => {
                    assert(provider.ec2.replaceRoute.notCalled);
                })
                .catch(err => Promise.reject(err));
        });

        it('throw an error on an unknown next hop discovery method', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges[0].routeNextHopAddresses = [{
                type: 'foo'
            }];

            return provider.updateRoutes({ localAddresses })
                .catch((err) => {
                    assert.strictEqual(err.message.indexOf('Invalid discovery type') !== -1, true);
                });
        });
    });

    describe('function getAssociatedAddressAndRouteInfo should', () => {
        it('return addresses and routes for active device ', () => {
            const expectedData = {
                instance: 'i-123',
                addresses: [
                    {
                        publicIpAddress: '1.1.1.1',
                        privateIpAddress: '1.1.1.1',
                        networkInterfaceId: '123'
                    }
                ],
                routes: [
                    {
                        routeTableId: '123',
                        routeTableName: null,
                        networkId: '123'
                    }
                ]
            };
            return provider.init(mockInitData)
                .then(() => {
                    provider._getElasticIPs = sinon.stub().resolves({
                        Addresses: [{
                            PublicIp: '1.1.1.1',
                            PrivateIpAddress: '1.1.1.1',
                            NetworkInterfaceId: '123'
                        }]
                    });
                    provider._getRouteTables = sinon.stub().resolves([
                        {
                            RouteTableId: '123',
                            routeTableName: null,
                            VpcId: '123'
                        }
                    ]);
                    return provider.getAssociatedAddressAndRouteInfo();
                })
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                })
                .catch(err => Promise.reject(err));
        });

        it('return addresses and not routes for standby device ', () => {
            const expectedData = {
                instance: 'i-123',
                addresses: [
                    {
                        publicIpAddress: '1.1.1.1',
                        privateIpAddress: '1.1.1.1',
                        networkInterfaceId: '123'
                    }
                ],
                routes: []
            };
            return provider.init(mockInitData)
                .then(() => {
                    provider._getElasticIPs = sinon.stub().resolves({
                        Addresses: [{
                            PublicIp: '1.1.1.1',
                            PrivateIpAddress: '1.1.1.1',
                            NetworkInterfaceId: '123'
                        }]
                    });
                    provider._getRouteTables = sinon.stub().resolves([]);
                    return provider.getAssociatedAddressAndRouteInfo();
                })
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                })
                .catch(err => Promise.reject(err));
        });
    });
});
