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
const { parse } = require('cruftless')();
const constants = require('../../../src/nodejs/constants');

const XML_TEMPLATES = constants.XML_TEMPLATES.AWS;
const cloud = 'aws';

describe('Provider - AWS', () => {
    let AWSCloudProvider;
    let provider;
    let util;
    let metadataPathRequest;
    let passedParams;
    let actualParams;
    let passedEIPParams;
    let unitTestContext;

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

    const mockMetadataSessionToken = 'this-test-session-token';

    const mockCredentials = {
        AccessKeyId: 'mockAccessKeyId',
        SecretAccessKey: 'SecretAccessKey',
        Token: mockMetadataSessionToken
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

    const bucket1 = {
        name: 'bucket1',
        region: 'us-west'
    };
    const targetBucket = {
        name: 'bucket2',
        region: 'us-west'
    };
    const bucket3 = {
        name: 'bucket3',
        region: 'us-west'
    };

    const _getAllS3BucketsStubResponse = [
        bucket1,
        targetBucket,
        bucket3
    ];

    const _getBucketTagsStubResponse = {
        bucket: targetBucket,
        TagSet: [{
            Key: 'sKey1',
            Value: 'storageKey1'
        }]
    };

    const genericAWSError = new Error('AWS vanished');

    let isRetryOccured;
    const mockProviderMakeRequest = () => {
        isRetryOccured = false;
        provider.maxRetries = 1;
        provider.originalMakeRequest = provider.makeRequest;
        provider.makeRequest = sinon.stub()
            .callsFake((host, uri, options) => {
                if (options.queryParams.Action === 'DescribeNetworkInterfaces') {
                    if (!isRetryOccured) {
                        isRetryOccured = true;
                        return Promise.reject(new Error('this is test error to confirm retry is enabled.'));
                    }
                }
                return provider.originalMakeRequest(host, uri, options);
            });
    };

    before(() => {
        AWSCloudProvider = require('../../../src/nodejs/providers/aws/cloud.js').Cloud;
        util = require('../../../src/nodejs/util');
    });
    beforeEach(() => {
        const Device = require('../../../src/nodejs/device.js');
        sinon.stub(Device.prototype, 'init').resolves();
        sinon.stub(Device.prototype, 'getProxySettings').resolves({
            host: '',
            port: 8080,
            protocol: 'http'
        });

        provider = new AWSCloudProvider(mockInitData);
        provider.logger = sinon.stub();
        provider.logger.info = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.silly = sinon.stub();
        provider.logger.warning = sinon.stub();

        provider.maxRetries = 0;
        provider.retryInterval = 100;

        util.makeRequest = sinon.stub()
            .callsFake((host, uri, options) => {
                metadataPathRequest = uri;
                switch (metadataPathRequest) {
                case '/latest/dynamic/instance-identity/document':
                    options = JSON.stringify(mockMetadata);
                    break;
                case '/latest/api/token':
                    options = mockMetadataSessionToken;
                    break;
                case '/latest/meta-data/iam/security-credentials/':
                    options = 'instanceProfileResponse';
                    break;
                case '/latest/meta-data/iam/security-credentials/instanceProfileResponse':
                    options = mockCredentials;
                    break;
                case '/':
                    // EC2
                    if (options.queryParams.Action) {
                        // EC2:DescribeAddresses
                        if (options.queryParams.Action === 'DescribeAddresses') {
                            const el = parse(XML_TEMPLATES.DescribeAddresses);

                            if (passedEIPParams) {
                                passedEIPParams = options.queryParams;
                                return Promise.resolve(el.toXML({ Addresses: [{ PublicIp: '1.2.3.4' }] }));
                            }

                            if (options.queryParams['Filter.1.Name'] && options.queryParams['Filter.1.Name'] !== null) {
                                const Addresses = [{
                                    PublicIp: '2.2.2.2',
                                    AssociationId: 'association-id',
                                    AllocationId: 'allocation-id'
                                }];

                                if (unitTestContext) {
                                    if (unitTestContext.privateIpAddress) {
                                        Addresses[0].PrivateIpAddress = unitTestContext.privateIpAddress;
                                        Addresses[0].Tags = [];
                                    }
                                    if (unitTestContext.Tag) {
                                        Addresses[0].PrivateIpAddress = '10.10.10.11';
                                        Addresses[0].Tags = [{ Key: unitTestContext.Tag, Value: '10.10.10.10,10.10.10.11' }];
                                    }
                                }

                                if (!Addresses[0].Tags && options.queryParams['Filter.1.Name'].match(/public-ip|tag:key1/)) {
                                    Addresses[0].Tags = [{ Key: '', Value: '' }];
                                }

                                return Promise.resolve(el.toXML({ Addresses }));
                            }
                        }
                        // EC2:DescribeNetworkInterfaces
                        if (options.queryParams.Action === 'DescribeNetworkInterfaces') {
                            Object.keys(options.queryParams).forEach((key) => {
                                if (key !== 'Action' && key !== 'Version') {
                                    passedParams[key] = options.queryParams[key];
                                }
                            });
                            if (unitTestContext.Args) {
                                unitTestContext.Args.push(options.queryParams['Filter.3.Name']);
                            }
                            const el = parse(XML_TEMPLATES.DescribeNetworkInterfaces);
                            return Promise.resolve(el.toXML(unitTestContext.DescribeNetworkInterfaces));
                        }
                        // EC2:AssociateAddress
                        if (options.queryParams.Action === 'AssociateAddress') {
                            Object.keys(options.queryParams).forEach((key) => {
                                if (!key.match(/Action|Version/)) {
                                    if (actualParams) {
                                        if (actualParams.assign.public.length === 0) {
                                            actualParams.assign.public.push({});
                                        }
                                        actualParams.assign.public[0][key] = options.queryParams[key];
                                    }
                                    if (passedParams) {
                                        passedParams[key] = options.queryParams[key];
                                    }
                                }
                            });
                            const el = parse(XML_TEMPLATES.AssociateAddress);
                            return Promise.resolve(el.toXML(options.queryParams));
                        }
                        // EC2:DisassociateAddress
                        if (options.queryParams.Action === 'DisassociateAddress') {
                            if (actualParams) {
                                if (actualParams.unassign.public.length === 0) {
                                    actualParams.unassign.public.push({});
                                }
                                actualParams.unassign.public[0].AssociationId = options.queryParams.AssociationId;
                            }
                            if (passedParams) {
                                passedParams = { AssociationId: options.queryParams.AssociationId };
                            }
                            unitTestContext.DisassociateAddress = { Return: true };
                            const el = parse(XML_TEMPLATES.DisassociateAddress);
                            return Promise.resolve(el.toXML(unitTestContext.DisassociateAddress));
                        }
                        // EC2:UnassignIpv6Addresses
                        if (options.queryParams.Action === 'UnassignIpv6Addresses') {
                            const el = parse(XML_TEMPLATES.UnassignIpv6Addresses);
                            options = el.toXML({ UnassignedIpv6Addresses: [options.queryParams['Ipv6Addresses.1']] });
                            return Promise.resolve(options);
                        }
                        // EC2:AssignIpv6Addresses
                        if (options.queryParams.Action === 'AssignIpv6Addresses') {
                            const el = parse(XML_TEMPLATES.AssignIpv6Addresses);
                            options = el.toXML({ AssignedIpv6Addresses: [options.queryParams['Ipv6Addresses.1']] });
                            return Promise.resolve(options);
                        }
                        // EC2:UnassignIpAddresses || AssignIpAddresses
                        if (options.queryParams.Action.match(/ssignPrivateIpAddresses$/)) {
                            const jsonResponse = {
                                NetworkInterfaceId: options.queryParams.NetworkInterfaceId,
                                PrivateIpAddresses: []
                            };
                            Object.keys(options.queryParams).forEach((key) => {
                                if (key.match(/^PrivateIpAddress\./)) {
                                    jsonResponse.PrivateIpAddresses.push(options.queryParams[key]);
                                }
                            });
                            if (options.queryParams.Action === 'UnassignPrivateIpAddresses') {
                                actualParams.unassign.private.push(jsonResponse);
                            } else {
                                actualParams.assign.private.push(jsonResponse);
                            }
                        }

                        const el = parse(XML_TEMPLATES[options.queryParams.Action]);
                        return Promise.resolve(el.toXML(unitTestContext[options.queryParams.Action]));
                    }
                    // S3:listObjectsV2
                    if (options.queryParams['list-type'] === 2) {
                        options = '<ListBucketResult><Contents><Key>f5cloudfailover/file.json</Key></Contents></ListBucketResult>';
                        break;
                    }
                    // S3:getBucketLocation
                    if (options.method === 'HEAD') {
                        options.headers['x-amz-bucket-region'] = 'us-west';
                        break;
                    }
                    // S3:getBucketTagging
                    if (options.queryParams.tagging === '' && uri === '/') {
                        options = host !== 'bucket2.s3.us-west.amazonaws.com'
                            ? '<Error><Code>AWS</Code><Message>Vanished</Message></Error>'
                            : `<Tagging><TagSet><Tag>
                                <Key>sKey1</Key><Value>storageKey1</Value>
                            </Tag></TagSet></Tagging>`;
                        break;
                    }
                    // S3:listBuckets
                    if (host === provider.s3_host) {
                        options = '<ListAllMyBucketsResult><Buckets>';
                        _getAllS3BucketsStubResponse.forEach((bucket) => {
                            if (Array.isArray(passedParams)) {
                                passedParams.push(bucket.name);
                            }
                            options += `<Bucket><Name>${bucket.name}</Name><CreationDate>${new Date().toISOString()}</CreationDate></Bucket>`;
                        });
                        options += '</Buckets></ListAllMyBucketsResult>';
                        break;
                    }

                    options = '<AwsResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/"><RouteTables/></AwsResponse>';
                    break;
                case '/f5cloudfailover/file.json':
                    // S3:getObject
                    passedParams = {
                        Bucket: host.replace(new RegExp(`.s3.${options.region}.amazonaws.com`), ''),
                        Key: uri.replace(/^\//, ''),
                        Body: !(options.method && options.method === 'PUT')
                            ? _s3FileParamsStub.Body
                            : options.Body || options.body
                    };
                    if (options.headers && options.headers['x-amz-server-side-encryption']) {
                        passedParams.ServerSideEncryption = options.headers['x-amz-server-side-encryption'];
                        if (options.headers['x-amz-server-side-encryption-aws-kms-key-id']) {
                            passedParams.SSEKMSKeyId = options.headers['x-amz-server-side-encryption-aws-kms-key-id'];
                        }
                    }
                    options = passedParams;
                    break;
                default:
                    break;
                }
                return Promise.resolve(options);
            });
    });
    after(() => {
        Object.keys(require.cache)
            .forEach((key) => {
                delete require.cache[key];
            });
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
            }));

        it('should initialize if trustedCertBundle is set', () => {
            mockInitData.trustedCertBundle = '/config/ssl/ssl.crt/ca-bundle.crt';

            return provider.init(mockInitData)
                .then(() => {
                    assert.strictEqual(provider.region, mockMetadata.region);
                    assert.strictEqual(provider.instanceId, mockMetadata.instanceId);
                });
        });

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
                });
        });

        describe('_getS3BucketByTags', () => {
            it('should return the tagged bucket', () => provider.init(mockInitData)
                .then(() => provider._getS3BucketByTags(mockInitData.storageTags))
                .then((response) => {
                    assert.deepStrictEqual(response, targetBucket);
                }));

            it('should reject if no buckets are found', () => provider.init(mockInitData)
                .then(() => provider._getS3BucketByTags({ fake: 'storageKey' }))
                .then(() => {
                    assert.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'No valid S3 Buckets found!');
                }));

            it('should reject if there is an error', () => provider.init(mockInitData)
                .then(() => {
                    provider.makeRequest = sinon.stub()
                        .callsFake((host, uri) => {
                            if (host === provider.s3_host && uri === '/') {
                                return Promise.reject(genericAWSError);
                            }
                            return Promise.resolve();
                        });
                    return provider._getS3BucketByTags(mockInitData.storageTags);
                })
                .then(() => {
                    assert.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, genericAWSError.message);
                }));

            it('should pass bucket names to _getBucketTags()', () => {
                passedParams = [];
                return provider.init(mockInitData)
                    .then(() => {
                        assert.deepEqual([bucket1, targetBucket, bucket3], _getAllS3BucketsStubResponse);
                    });
            });
        });

        describe('_getAllS3Buckets', () => {
            it('should return an array of bucket names', () => provider.init(mockInitData)
                .then(() => provider._getAllS3Buckets())
                .then((response) => {
                    assert.deepEqual(response, [bucket1, targetBucket, bucket3]);
                }));
        });

        describe('_getBucketTags', () => {
            it('should resolve on error if continueOnError is provided', () => provider.init(mockInitData)
                .then(() => provider._getBucketTags(targetBucket, { continueOnError: true })));

            it('should reject on error if not continueOnError', () => provider.init(mockInitData)
                .then(() => provider._getBucketTags('fakebucket', { continueOnError: false }))
                .then(() => {
                    assert.ok(false, 'Should have thrown an error');
                })
                .catch((err) => {
                    assert.match(err.toString(), /^Error: AWS; Message: Vanished/);
                }));

            it('should pass correct parameters to getBucketTagging()', () => provider.init(mockInitData)
                .then(() => provider._getBucketTags(targetBucket))
                .then((response) => {
                    assert.strictEqual(response.bucket, _getBucketTagsStubResponse.bucket);
                    assert.deepEqual(response, _getBucketTagsStubResponse);
                }));
        });
    });

    describe('function _getInstanceIdentityDoc', () => {
        it('should call _getInstanceIdentityDoc to get instance data', () => provider._getInstanceIdentityDoc()
            .then(() => {
                assert.strictEqual(metadataPathRequest, '/latest/dynamic/instance-identity/document');
            }));

        it('should reject upon error', () => {
            const expectedError = 'cannot contact AWS metadata service';
            return provider.init(mockInitData)
                .then(() => {
                    util.makeRequest = sinon.stub()
                        .callsFake((host, uri, options) => {
                            metadataPathRequest = uri;
                            return metadataPathRequest === '/latest/dynamic/instance-identity/document'
                                ? Promise.reject(new Error(expectedError, options))
                                : Promise.resolve();
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
            assert.strictEqual(provider.region, mockMetadata.region);
        }));

    describe('function _getElasticIPs', () => {
        it('should get Elastic IPs from AWS', () => {
            passedEIPParams = {};

            return provider.init(mockInitData)
                .then(() => provider._getElasticIPs({ tags: mockInitData.addressTags }))
                .then((results) => {
                    assert.deepEqual(results, _getElasticIPsStubResponse);
                    assert.deepEqual(passedEIPParams, {
                        Action: 'DescribeAddresses',
                        Version: constants.API_VERSION_EC2,
                        'Filter.1.Name': 'tag:key1',
                        'Filter.1.Value': 'value1',
                        'Filter.2.Name': 'tag:key2',
                        'Filter.2.Value': 'value2'
                    });
                    passedEIPParams = false;
                });
        });

        it('should reject upon error', () => {
            const expectedError = 'cannot describe the EIP adddresses';
            provider.maxRetries = 10;
            let retryCount = 0;
            return provider.init(mockInitData)
                .then(() => {
                    provider.originalMakeRequest = provider.makeRequest;
                    provider.makeRequest = sinon.stub()
                        .callsFake((host, uri, options) => {
                            if (options.queryParams.Action === 'DescribeAddresses') {
                                if (retryCount <= provider.maxRetries) {
                                    retryCount += 1;
                                    return Promise.reject(new Error(expectedError));
                                }
                            }
                            return provider.originalMakeRequest(host, uri, options);
                        });
                    return provider._getElasticIPs(mockInitData.addressTags);
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, expectedError);
                    assert.strictEqual(retryCount - 1, provider.maxRetries);
                });
        });
    });

    describe('function _getSubnets', () => {
        unitTestContext = unitTestContext || {};
        unitTestContext.DescribeSubnets = { Subnets: [{ State: 'foo', OwnerId: 'bar' }] };

        it('should verify _getSubnets method resolution', () => provider.init(mockInitData)
            .then(() => provider._getSubnets())
            .then(() => {
                assert.deepStrictEqual(provider.subnets, unitTestContext.DescribeSubnets);
            }));
    });

    describe('function _getPrivateSecondaryIPs', () => {
        unitTestContext = unitTestContext || {};
        unitTestContext.DescribeNetworkInterfaces = {
            NetworkInterfaces: [
                {
                    NetworkInterfaceId: 'eni-2345',
                    PrivateIpAddress: '1.2.3.4',
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
                    PrivateIpAddress: '3.4.5.6',
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
            .then(() => provider._getPrivateSecondaryIPs())
            .then((results) => {
                assert.deepEqual(results, _getPrivateSecondaryIPsStubResponse);
            }));

        it('should pass correct parameters', () => {
            passedParams = {};
            return provider.init(mockInitData)
                .then(() => provider._getPrivateSecondaryIPs())
                .then(() => {
                    assert.deepEqual(passedParams, {
                        'Filter.1.Name': 'attachment.instance-id',
                        'Filter.1.Value': 'i-123'
                    });
                });
        });

        it('should reject upon error', () => {
            const expectedError = 'cannot describe the Network Interfaces';
            provider.maxRetries = 10;
            let retryCount = 0;
            return provider.init(mockInitData)
                .then(() => {
                    provider.originalMakeRequest = provider.makeRequest;
                    provider.makeRequest = sinon.stub()
                        .callsFake((host, uri, options) => {
                            if (options.queryParams.Action === 'DescribeNetworkInterfaces') {
                                if (retryCount <= provider.maxRetries) {
                                    retryCount += 1;
                                    return Promise.reject(new Error(expectedError));
                                }
                            }
                            return provider.originalMakeRequest(host, uri, options);
                        });
                    return provider._getPrivateSecondaryIPs();
                })
                .then(() => {
                    assert.ok(false, 'should have rejected');
                })
                .catch((err) => {
                    assert.strictEqual(retryCount - 1, provider.maxRetries);
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
            }));
    });

    describe('function _associatePublicAddress', () => {
        const allocationId = 'eipalloc-0b5671ebba3628edd';
        const networkInterfaceId = 'eni-0157ac0f9506af78b';
        const privateIpAddress = '10.0.1.11';

        beforeEach(() => {
            passedParams = {};
        });

        it('should pass correct parameters to AWS call', () => provider.init(mockInitData)
            .then(() => provider._associatePublicAddress(allocationId, networkInterfaceId, privateIpAddress))
            .then(() => {
                assert.deepEqual(passedParams, {
                    AllocationId: allocationId,
                    NetworkInterfaceId: networkInterfaceId,
                    PrivateIpAddress: privateIpAddress,
                    AllowReassociation: true
                });
            }));

        it('should reject upon error', () => {
            const expectedError = 'cannot associate Elastic IP';
            return provider.init(mockInitData)
                .then(() => {
                    // eslint-disable-next-line arrow-body-style
                    provider._associatePublicAddress = sinon.stub()
                        .callsFake(() => Promise.reject(new Error(expectedError)));
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
        passedParams = {};
        const associationIdToDisassociate = 'eipassoc-00523b2b8b8c01793';

        it('should pass correct parameters to AWS call', () => provider.init(mockInitData)
            .then(() => provider._disassociatePublicAddress(associationIdToDisassociate))
            .then(() => {
                assert.deepEqual(passedParams, {
                    AssociationId: associationIdToDisassociate
                });
            }));
    });

    describe('function _reassociatePublicAddresses', () => {
        it('should call _disassociatePublicAddress with correct params', () => provider.init(mockInitData)
            .then(() => {
                passedParams = [];
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
            }));

        it('should call _associatePublicAddress with correct params', () => provider.init(mockInitData)
            .then(() => {
                passedParams = [];
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
            }));

        it('should not reject if there is no work to do', () => provider.init(mockInitData)
            .then(() => provider._reassociatePublicAddresses([]))
            .then(() => {
                assert.ok(true);
            }));
    });

    describe('function updateAddress', () => {
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
                .catch((err) => Promise.reject(err));
        });

        it('should not throw error if update operations is empty', () => {
            const opts = { updateOperations: {} };
            return provider.updateAddresses(opts);
        });

        it('should validate private+public address gets reassociated', () => {
            unitTestContext = unitTestContext || {};
            unitTestContext.DescribeNetworkInterfaces = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-1',
                        PrivateIpAddress: '1.2.3.4',
                        PrivateIpAddresses: [
                            {
                                Primary: true,
                                PrivateIpAddress: '1.2.3.4'
                            }
                        ],
                        TagSet: nicsTagSet,
                        SubnetId: 'subnet-00e0083fedd84419f'
                    },
                    {
                        NetworkInterfaceId: 'eni-2',
                        PrivateIpAddress: '1.2.3.5',
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
                        TagSet: nicsTagSet,
                        SubnetId: 'subnet-00e0083fedd84419f'
                    }
                ]
            };
            unitTestContext.DescribeSubnets = {
                Subnets: [
                    {
                        CidrBlock: '1.2.3.0/24',
                        SubnetId: 'subnet-00e0083fedd84419f'
                    }
                ]
            };

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
                });
        });

        it('should validate private+public address gets reassociated without Subnet information', () => {
            unitTestContext = unitTestContext || {};
            unitTestContext.DescribeNetworkInterfaces = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-1',
                        PrivateIpAddress: '1.2.3.4',
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
                        PrivateIpAddress: '1.2.3.5',
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
            const originalDescribeSubnets = provider._getSubnets;
            provider._getSubnets = sinon.stub()
                .returns({
                    promise() {
                        return Promise.reject(new Error('No permissions'));
                    }
                });

            return provider.updateAddresses({ localAddresses, failoverAddresses })
                .then(() => {
                    provider._getSubnets = originalDescribeSubnets;
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
                });
        });

        // validate
        ['f5_cloud_failover_vips', 'VIPS'].forEach((vipTagName) => {
            it(`should validate public address gets reassociated (using ${vipTagName} tag)`, () => {
                unitTestContext = { Tag: vipTagName };
                unitTestContext.DescribeNetworkInterfaces = {
                    NetworkInterfaces: [
                        {
                            NetworkInterfaceId: 'eni-1',
                            PrivateIpAddress: '10.10.10.10',
                            PrivateIpAddresses: [
                                {
                                    Primary: false,
                                    PrivateIpAddress: '10.10.10.10'
                                }
                            ],
                            TagSet: [],
                            SubnetId: 'subnet-00e0083fedd84419f'
                        },
                        {
                            NetworkInterfaceId: 'eni-2',
                            PrivateIpAddress: '10.10.10.100',
                            PrivateIpAddresses: [
                                {
                                    Primary: false,
                                    PrivateIpAddress: '10.10.10.100'
                                }
                            ],
                            TagSet: [],
                            SubnetId: 'subnet-00e0083fedd84419f'
                        }
                    ]
                };
                unitTestContext.DescribeSubnets = {
                    Subnets: [
                        {
                            CidrBlock: '10.10.10.0/24',
                            SubnetId: 'subnet-00e0083fedd84419f'
                        }
                    ]
                };

                return provider.discoverAddresses()
                    .then((operations) => provider.updateAddresses({ updateOperations: operations }))
                    .then(() => {
                        // unitTestContext = false;
                        // assert public address gets reassociated properly
                        assert.deepStrictEqual(actualParams.unassign.public, [{ AssociationId: 'association-id' }]);
                        assert.deepStrictEqual(actualParams.assign.public, [{
                            AllocationId: 'allocation-id',
                            NetworkInterfaceId: 'eni-1',
                            PrivateIpAddress: '10.10.10.10',
                            AllowReassociation: true
                        }]);
                    });
            });
        });
    });

    describe('function discoverAddressOperationsUsingDefinitions', () => {
        const addresses = {
            localAddresses: ['1.2.3.4', '2.3.4.5'],
            failoverAddresses: ['10.10.10.10', '10.10.10.11', '2600:1f14:92a:bc03:8459:976:1950:32a2', '2600:1f14:92a:bc03:8459:976:1950:33a2', '2600:1f14:92a:bc03:8459:976:1950:34a2']
        };
        after(() => {
            unitTestContext = false;
        });
        it('should validate same-net case', () => {
            unitTestContext = { privateIpAddress: '10.10.10.10' };
            unitTestContext.DescribeNetworkInterfaces = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-000001',
                        PrivateIpAddress: '1.2.3.4',
                        PrivateIpAddresses: [
                            {
                                Primary: true,
                                PrivateIpAddress: '1.2.3.4'
                            }
                        ],
                        TagSet: [],
                        SubnetId: 'subnet-02d5ddf8d8383ac1e'
                    },
                    {
                        NetworkInterfaceId: 'eni-000002',
                        PrivateIpAddress: '1.2.3.5',
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
                        Ipv6Addresses: [
                            {
                                Ipv6Address: '2600:1f13:5f9:5703:45bf:420f:442:c576'
                            },
                            {
                                Ipv6Address: '2600:1f14:92a:bc03:8459:976:1950:32a2'
                            },
                            {
                                Ipv6Address: '2600:1f14:92a:bc03:8459:976:1950:33a2'
                            },
                            {
                                Ipv6Address: '2600:1f14:92a:bc03:8459:976:1950:34a2'
                            }
                        ],
                        TagSet: [],
                        SubnetId: 'subnet-02d5ddf8d8383ac1e'
                    },
                    {
                        NetworkInterfaceId: 'eni-000003',
                        PrivateIpAddress: '2.3.4.5',
                        PrivateIpAddresses: [
                            {
                                Primary: true,
                                PrivateIpAddress: '2.3.4.5'
                            }
                        ],
                        TagSet: [],
                        SubnetId: 'subnet-02d5ddf8d8383ac2e'
                    },
                    {
                        NetworkInterfaceId: 'eni-000004',
                        PrivateIpAddress: '2.3.4.6',
                        PrivateIpAddresses: [
                            {
                                Primary: true,
                                PrivateIpAddress: '2.3.4.6'
                            },
                            {
                                Primary: false,
                                PrivateIpAddress: '10.10.11.10',
                                Association: {}
                            },
                            {
                                Primary: false,
                                PrivateIpAddress: '10.10.11.11',
                                Association: {}
                            }
                        ],
                        Ipv6Addresses: [],
                        TagSet: [],
                        SubnetId: 'subnet-02d5ddf8d8383ac2e'
                    }
                ],
                Tags: []
            };
            const addressGroupDefinitions = [
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.10.10'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.10.11'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.11.10'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.11.11'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '2600:1f14:92a:bc03:8459:976:1950:32a2'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '2600:1f14:92a:bc03:8459:976:1950:33a2'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '2600:1f14:92a:bc03:8459:976:1950:34a2'
                }
            ];
            unitTestContext.DescribeSubnets = {
                Subnets: [
                    {
                        CidrBlock: '1.2.3.0/24',
                        SubnetId: 'subnet-02d5ddf8d8383ac1e'
                    },
                    {
                        CidrBlock: '2.3.4.0/24',
                        SubnetId: 'subnet-02d5ddf8d8383ac2e'
                    }
                ]
            };

            mockProviderMakeRequest();

            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, {})
                .then((response) => {
                    unitTestContext = {};
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                    assert.strictEqual(JSON.stringify(response.loadBalancerAddresses), JSON.stringify({}));
                    assert.strictEqual(response.interfaces.disassociate[1].networkInterfaceId, 'eni-000002');
                    assert.strictEqual(response.interfaces.disassociate[1].addresses.length, 5);
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[0].address, '2600:1f14:92a:bc03:8459:976:1950:34a2');
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[0].ipVersion, 6);
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[1].address, '2600:1f14:92a:bc03:8459:976:1950:33a2');
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[1].ipVersion, 6);
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[2].address, '2600:1f14:92a:bc03:8459:976:1950:32a2');
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[2].ipVersion, 6);
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[3].address, '10.10.10.11');
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[3].publicAddress, undefined);
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[3].ipVersion, 4);
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[4].address, '10.10.10.10');
                    assert.strictEqual(response.interfaces.disassociate[1].addresses[4].publicAddress, '2.2.2.2');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses.length, 2);
                    assert.strictEqual(response.interfaces.disassociate[0].networkInterfaceId, 'eni-000004');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[0].address, '10.10.11.11');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[1].address, '10.10.11.10');
                    assert.strictEqual(response.interfaces.associate[1].networkInterfaceId, 'eni-000001');
                    assert.strictEqual(response.interfaces.associate[1].addresses.length, 5);
                    assert.strictEqual(response.interfaces.associate[1].addresses[0].address, '2600:1f14:92a:bc03:8459:976:1950:34a2');
                    assert.strictEqual(response.interfaces.associate[1].addresses[0].ipVersion, 6);
                    assert.strictEqual(response.interfaces.associate[1].addresses[1].address, '2600:1f14:92a:bc03:8459:976:1950:33a2');
                    assert.strictEqual(response.interfaces.associate[1].addresses[1].ipVersion, 6);
                    assert.strictEqual(response.interfaces.associate[1].addresses[2].address, '2600:1f14:92a:bc03:8459:976:1950:32a2');
                    assert.strictEqual(response.interfaces.associate[1].addresses[2].ipVersion, 6);
                    assert.strictEqual(response.interfaces.associate[1].addresses[3].address, '10.10.10.11');
                    assert.strictEqual(response.interfaces.associate[1].addresses[3].ipVersion, 4);
                    assert.strictEqual(response.interfaces.associate[1].addresses[3].publicAddress, undefined);
                    assert.strictEqual(response.interfaces.associate[1].addresses[4].address, '10.10.10.10');
                    assert.strictEqual(response.interfaces.associate[1].addresses[4].ipVersion, 4);
                    assert.strictEqual(response.interfaces.associate[1].addresses[4].publicAddress, '2.2.2.2');
                    assert.strictEqual(response.interfaces.associate[0].networkInterfaceId, 'eni-000003');
                    assert.strictEqual(response.interfaces.associate[0].addresses.length, 2);
                    assert.strictEqual(response.interfaces.associate[0].addresses[0].address, '10.10.11.11');
                    assert.strictEqual(response.interfaces.associate[0].addresses[1].address, '10.10.11.10');
                    assert.ok(isRetryOccured);
                });
        });

        it('should validate across-net case', () => {
            unitTestContext = { privateIpAddress: '10.10.10.10' };
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
            unitTestContext.DescribeNetworkInterfaces = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-000002',
                        PrivateIpAddress: '10.10.10.100',
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
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, {})
                .then((response) => {
                    unitTestContext = false;
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].current.PrivateIpAddress, '10.10.10.10');
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].current.AssociationId, 'association-id');
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].target.PrivateIpAddress, '10.10.10.100');
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].target.NetworkInterfaceId, 'eni-000002');
                    assert.strictEqual(response.publicAddresses['2.2.2.2'].AllocationId, 'allocation-id');
                });
        });

        it('across-net addressGroupDefinitions vipAddress are empty', () => {
            const addressGroupDefinitions = [
                {
                    type: 'elasticIpAddress',
                    scopingAddress: '2.2.2.2',
                    vipAddresses: []
                }
            ];
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, {})
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                });
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
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, {})
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                });
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
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, {})
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                });
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
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, {})
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                });
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
            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, {})
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                });
        });
    });

    describe('function uploadDataToStorage', () => {
        const thisMockInitData = {
            storageEncryption: {
                serverSide: {
                    enabled: false
                }
            }
        };

        it('should pass correct params to putObject', () => provider.init(thisMockInitData)
            .then(() => {
                provider.s3BucketName = 'myfailoverbucket';
                passedParams = {};
                return provider.uploadDataToStorage('file.json', _s3FileParamsStub.Body);
            })
            .then(() => {
                assert.deepEqual(passedParams, _s3FileParamsStub);
            }));
    });

    describe('function uploadDataToStorage encrypted with AWS managed key', () => {
        const _s3FileParamsStubEncrypted = {
            Body: 's3 state file body',
            Bucket: 'myfailoverbucket',
            Key: 'f5cloudfailover/file.json',
            ServerSideEncryption: 'aws:kms'
        };

        const thisMockInitData = {
            storageEncryption: {
                serverSide: {
                    enabled: true,
                    algorithm: 'aws:kms'
                }
            }
        };

        it('should pass correct params to putObject with AWS managed key', () => provider.init(thisMockInitData)
            .then(() => {
                provider.s3BucketName = 'myfailoverbucket';
                passedParams = {};
                return provider.uploadDataToStorage('file.json', _s3FileParamsStubEncrypted.Body);
            })
            .then(() => {
                assert.deepEqual(passedParams, _s3FileParamsStubEncrypted);
            }));
    });

    describe('function uploadDataToStorage encrypted with customer key', () => {
        const _s3FileParamsStubEncryptedCustomerKey = {
            Body: 's3 state file body',
            Bucket: 'myfailoverbucket',
            Key: 'f5cloudfailover/file.json',
            ServerSideEncryption: 'aws:kms',
            SSEKMSKeyId: 'mrk-e6113680390641cab86a87e821e43764'
        };

        const thisMockInitData = {
            storageEncryption: {
                serverSide: {
                    enabled: true,
                    algorithm: 'aws:kms',
                    keyId: 'mrk-e6113680390641cab86a87e821e43764'
                }
            }
        };

        it('should pass correct params to putObject with customer key', () => provider.init(thisMockInitData)
            .then(() => {
                provider.s3BucketName = 'myfailoverbucket';
                passedParams = {};
                return provider.uploadDataToStorage('file.json', _s3FileParamsStubEncryptedCustomerKey.Body);
            })
            .then(() => {
                assert.deepEqual(passedParams, _s3FileParamsStubEncryptedCustomerKey);
            }));
    });

    describe('function downloadDataFromStorage', () => {
        it('should pass correct params to downloadObject', () => provider.init(mockInitData)
            .then(() => {
                provider.s3BucketName = 'myfailoverbucket';
                passedParams = {};
                return provider.downloadDataFromStorage('file.json');
            })
            .then((data) => {
                assert.strictEqual(data.Bucket, _s3FileParamsStub.Bucket);
                assert.strictEqual(data.Key, _s3FileParamsStub.Key);
                assert.deepStrictEqual(data.Body, _s3FileParamsStub.Body);
            }));

        it('should return empty object if listObjects is empty', () => provider.init(mockInitData)
            .then(() => {
                provider.s3BucketName = 'myfailoverbucket';

                return provider.downloadDataFromStorage('fake.json');
            })
            .then((data) => {
                assert.deepStrictEqual(data, {});
            }));
    });

    describe('function updateRoutes should', () => {
        const localAddresses = ['10.0.1.211'];

        beforeEach(() => {
            unitTestContext = unitTestContext || {};
            unitTestContext.DescribeRouteTables = {
                RouteTables: [{
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
                }]
            };
            unitTestContext = unitTestContext || {};
            unitTestContext.DescribeNetworkInterfaces = {
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
                    provider._replaceEc2Route = sinon.stub()
                        .returns({
                            promise() {
                                return Promise.resolve({});
                            }
                        });
                });
        });
        after(() => {
            unitTestContext = {};
        });

        it('should not throw error if update operations is empty', () => {
            const opts = { updateOperations: {} };
            return provider.updateRoutes(opts);
        });

        it('update routes using next hop discovery method: routeTag', () => provider.updateRoutes({
            localAddresses,
            discoverOnly: true
        })
            .then((operations) => provider.updateRoutes({ updateOperations: operations }))
            .then(() => {
                assert(provider._replaceEc2Route.calledOnce);
                assert(provider._replaceEc2Route.calledWith({
                    NetworkInterfaceId: 'eni-345',
                    RouteTableId: 'rtb-123',
                    DestinationCidrBlock: '192.0.2.0/24',
                    Action: 'ReplaceRoute'
                }));
            }));

        it('not update routes if matching route is not found', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges[0].routeAddresses = ['192.0.100.0/24'];

            return provider.updateRoutes({ localAddresses })
                .then(() => {
                    assert(provider._replaceEc2Route.notCalled);
                });
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
                    assert(provider._replaceEc2Route.calledOnce);
                    assert(provider._replaceEc2Route.calledWith({
                        DestinationCidrBlock: '192.0.2.0/24',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123',
                        Action: 'ReplaceRoute'
                    }));
                });
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

            unitTestContext.Args = [];
            return provider.updateRoutes({ localAddresses: ['10.0.1.211', '2600:1f13:12f:a803:5d15:e0e:1af9:8221'] })
                .then(() => {
                    assert(unitTestContext.Args[0] === 'private-ip-address');
                    assert(unitTestContext.Args[1] === 'private-ip-address');
                    assert(unitTestContext.Args[2] === 'ipv6-addresses.ipv6-address');
                    assert(unitTestContext.Args.length === 3);
                    unitTestContext.Args = undefined;
                    assert(provider._replaceEc2Route.calledWith({
                        DestinationCidrBlock: '192.0.2.0/24',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123',
                        Action: 'ReplaceRoute'
                    }));
                    assert(provider._replaceEc2Route.calledWith({
                        DestinationIpv6CidrBlock: '::/0',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123',
                        Action: 'ReplaceRoute'
                    }));
                    assert(provider._replaceEc2Route.calledWith({
                        DestinationCidrBlock: '192.0.2.1/24',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123',
                        Action: 'ReplaceRoute'
                    }));
                });
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
                    assert(provider._replaceEc2Route.calledOnce);
                    assert(provider._replaceEc2Route.calledWith({
                        DestinationIpv6CidrBlock: '::/0',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123',
                        Action: 'ReplaceRoute'
                    }));
                });
        });

        it('update routes using next hop discovery method: static (with retries)', () => {
            provider.routeGroupDefinitions[0].routeAddressRanges[0] = {
                routeAddresses: ['192.0.2.0/24'],
                routeNextHopAddresses: {
                    type: 'static',
                    items: ['10.0.1.211', '10.0.11.52']
                }
            };

            provider.maxRetries = 10;
            let retryOccured = false;
            provider.maxRetries = 1;
            provider.originalReplaceEc2Route = provider._replaceEc2Route;
            provider._replaceEc2Route = sinon.stub()
                .callsFake((queryParams) => {
                    if (queryParams.Action === 'ReplaceRoute') {
                        if (!retryOccured) {
                            retryOccured = true;
                            return Promise.reject(new Error('this is test error to confirm retry is enabled.'));
                        }
                    }
                    return provider.originalReplaceEc2Route(queryParams);
                });

            return provider.updateRoutes({ localAddresses })
                .then(() => {
                    assert(provider._replaceEc2Route.calledTwice);
                    assert(provider._replaceEc2Route.calledWith({
                        DestinationCidrBlock: '192.0.2.0/24',
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123',
                        Action: 'ReplaceRoute'
                    }));
                });
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
                    assert(provider._replaceEc2Route.calledOnce);
                    assert(provider._replaceEc2Route.calledWith({
                        NetworkInterfaceId: 'eni-345',
                        RouteTableId: 'rtb-123',
                        DestinationCidrBlock: '192.0.2.0/24',
                        Action: 'ReplaceRoute'
                    }));
                });
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
                    assert(provider._replaceEc2Route.notCalled);
                });
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
            unitTestContext = unitTestContext || {};
            unitTestContext.DescribeInstances = {
                Reservations: [{
                    Instances: [{
                        NetworkInterfaces: [{
                            NetworkInterfaceId: '123',
                            PrivateIpAddresses: [{
                                PrivateIpAddress: '1.1.1.1',
                                Association: {
                                    PublicIp: '1.1.1.1'
                                }
                            }]
                        }]
                    }]
                }]
            };
            return provider.init(mockInitData)
                .then(() => {
                    provider._getRouteTables = sinon.stub().resolves([
                        {
                            RouteTableId: '123',
                            routeTableName: null,
                            VpcId: '123'
                        }
                    ]);
                    return provider.getAssociatedAddressAndRouteInfo(true, true);
                })
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                });
        });

        it('skip routes for active device ', () => {
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
                    provider._getRouteTables = sinon.stub().resolves([
                        {
                            RouteTableId: '123',
                            routeTableName: null,
                            VpcId: '123'
                        }
                    ]);
                    return provider.getAssociatedAddressAndRouteInfo(true, false);
                })
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                });
        });

        it('skip addresses for active device ', () => {
            const expectedData = {
                instance: 'i-123',
                addresses: [],
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
                    provider._getRouteTables = sinon.stub().resolves([
                        {
                            RouteTableId: '123',
                            routeTableName: null,
                            VpcId: '123'
                        }
                    ]);
                    return provider.getAssociatedAddressAndRouteInfo(false, true);
                })
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                });
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
                    provider._getRouteTables = sinon.stub().resolves([]);
                    return provider.getAssociatedAddressAndRouteInfo(true, true);
                })
                .then((data) => {
                    assert.deepStrictEqual(expectedData, data);
                });
        });
    });

    describe('IPv6 testing', () => {
        const addresses = {
            localAddresses: ['1.2.3.4'],
            failoverAddresses: ['10.10.10.10', '10.10.10.11', '2600:1f14:92a:bc03:8459:976:1950:32b2', '2600:1f14:92a:bc03:8459:976:1950:32a2', '2600:1f14:92a:bc03:8459:976:1950:33a2', '2600:1f14:92a:bc03:8459:976:1950:34a2', '2600:1f14:92a:bc03:8459:976:1950:32c2']
        };
        it('should ignore additional failoverAddress', () => {
            unitTestContext = unitTestContext || {};
            unitTestContext.DescribeNetworkInterfaces = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-000001',
                        PrivateIpAddress: '1.2.3.4',
                        PrivateIpAddresses: [
                            {
                                Primary: true,
                                PrivateIpAddress: '1.2.3.4'
                            }
                        ],
                        TagSet: [],
                        SubnetId: 'subnet-02d5ddf8d8383ac1e'
                    },
                    {
                        NetworkInterfaceId: 'eni-000002',
                        PrivateIpAddress: '1.2.3.5',
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
                        Ipv6Addresses: [
                            {
                                Ipv6Address: '2600:1f13:5f9:5703:45bf:420f:442:c576'
                            },
                            {
                                Ipv6Address: '2600:1f14:92a:bc03:8459:976:1950:32a2'
                            },
                            {
                                Ipv6Address: '2600:1f14:92a:bc03:8459:976:1950:33a2'
                            },
                            {
                                Ipv6Address: '2600:1f14:92a:bc03:8459:976:1950:34a2'
                            }
                        ],
                        TagSet: [],
                        SubnetId: 'subnet-02d5ddf8d8383ac1e'
                    }
                ],
                Tags: []
            };
            const addressGroupDefinitions = [
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.10.10'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '10.10.10.11'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '2600:1f14:92a:bc03:8459:976:1950:32a2'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '2600:1f14:92a:bc03:8459:976:1950:33a2'
                },
                {
                    type: 'networkInterfaceAddress',
                    scopingAddress: '2600:1f14:92a:bc03:8459:976:1950:34a2'
                }
            ];
            unitTestContext.DescribeSubnets = {
                Subnets: [
                    {
                        CidrBlock: '1.2.3.0/24',
                        SubnetId: 'subnet-02d5ddf8d8383ac1e'
                    }
                ]
            };

            mockProviderMakeRequest();

            return provider.discoverAddressOperationsUsingDefinitions(addresses, addressGroupDefinitions, {})
                .then((response) => {
                    assert.strictEqual(JSON.stringify(response.publicAddresses), JSON.stringify({}));
                    assert.strictEqual(JSON.stringify(response.loadBalancerAddresses), JSON.stringify({}));
                    assert.strictEqual(response.interfaces.disassociate[0].networkInterfaceId, 'eni-000002');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses.length, 5);
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[0].address, '2600:1f14:92a:bc03:8459:976:1950:34a2');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[0].ipVersion, 6);
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[1].address, '2600:1f14:92a:bc03:8459:976:1950:33a2');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[1].ipVersion, 6);
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[2].address, '2600:1f14:92a:bc03:8459:976:1950:32a2');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[2].ipVersion, 6);
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[3].address, '10.10.10.11');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[3].publicAddress, undefined);
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[3].ipVersion, 4);
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[4].address, '10.10.10.10');
                    assert.strictEqual(response.interfaces.disassociate[0].addresses[4].publicAddress, '2.2.2.2');
                    assert.strictEqual(response.interfaces.associate[0].networkInterfaceId, 'eni-000001');
                    assert.strictEqual(response.interfaces.associate[0].addresses.length, 5);
                    assert.strictEqual(response.interfaces.associate[0].addresses[0].address, '2600:1f14:92a:bc03:8459:976:1950:34a2');
                    assert.strictEqual(response.interfaces.associate[0].addresses[0].ipVersion, 6);
                    assert.strictEqual(response.interfaces.associate[0].addresses[1].address, '2600:1f14:92a:bc03:8459:976:1950:33a2');
                    assert.strictEqual(response.interfaces.associate[0].addresses[1].ipVersion, 6);
                    assert.strictEqual(response.interfaces.associate[0].addresses[2].address, '2600:1f14:92a:bc03:8459:976:1950:32a2');
                    assert.strictEqual(response.interfaces.associate[0].addresses[2].ipVersion, 6);
                    assert.strictEqual(response.interfaces.associate[0].addresses[3].address, '10.10.10.11');
                    assert.strictEqual(response.interfaces.associate[0].addresses[3].ipVersion, 4);
                    assert.strictEqual(response.interfaces.associate[0].addresses[3].publicAddress, undefined);
                    assert.strictEqual(response.interfaces.associate[0].addresses[4].address, '10.10.10.10');
                    assert.strictEqual(response.interfaces.associate[0].addresses[4].ipVersion, 4);
                    assert.strictEqual(response.interfaces.associate[0].addresses[4].publicAddress, '2.2.2.2');
                    assert.ok(isRetryOccured);
                })
                .catch((err) => assert.fail(err));
        });
    });
});
