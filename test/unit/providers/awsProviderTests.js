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
        storageName: 's3BucketName',
        storageDnsName: ''
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
    const bucket4 = {
        name: 'bucket4',
        region: 'cn-north-1'
    };

    const _getAllS3BucketsStubResponse = [
        bucket1,
        targetBucket,
        bucket3,
        bucket4
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
                        options.headers['x-amz-bucket-region'] = !host.includes('bucket4') ? 'us-west' : 'cn-north-1';
                        break;
                    }
                    // S3:getBucketTagging
                    if (options.queryParams.tagging === '' && uri === '/') {
                        options = host !== 'bucket2.s3.us-west.amazonaws.com' && !host.includes('s3.cn-north-1.amazonaws.com.cn')
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

        it('should ignore trustedCertBundle that resolves outside the allowed base directory', () => {
            mockInitData.trustedCertBundle = '/config/ssl/../../etc/passwd';

            return provider.init(mockInitData)
                .then(() => {
                    assert.strictEqual(provider.region, mockMetadata.region);
                    assert.strictEqual(provider.instanceId, mockMetadata.instanceId);
                    // path traversal escapes /config/ and is rejected with a warning
                    assert.ok(provider.logger.warning.called);
                    assert.ok(provider.logger.warning.args.some(
                        (callArgs) => /must reside within \/config\//.test(callArgs[0])
                    ));
                });
        });

        it('should ignore trustedCertBundle outside the allowed base directory', () => {
            mockInitData.trustedCertBundle = '/etc/passwd';

            return provider.init(mockInitData)
                .then(() => {
                    assert.strictEqual(provider.region, mockMetadata.region);
                    assert.ok(provider.logger.warning.called);
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

        it('should initialize if storageName is fully qualified then return bucket name', () => {
            provider.region = mockMetadata.region;
            provider.instanceId = mockMetadata.instanceId;
            provider.storageName = 's3BucketName.s3.us-east-1.amazonaws.com';

            return provider.init({ storageName: 's3BucketName.s3.us-east-1.amazonaws.com' })
                .then(() => {
                    assert.strictEqual(provider.s3BucketName, 's3BucketName');
                    assert.strictEqual(provider.s3BucketRegion, 'us-east-1');
                });
        });

        it('should initialize if storageName and storageDnsName are set then return bucket name and endpoint link', () => {
            provider.region = mockMetadata.region;
            provider.instanceId = mockMetadata.instanceId;
            provider.storageName = mockMetadata.storageName;

            return provider.init({ storageName: 's3BucketName', storageDnsName: 'vpce-xxxxxxx.xxxxxxx.vpce.amazonaws.com' })
                .then(() => {
                    assert.strictEqual(provider.storageName, 's3BucketName');
                    assert.strictEqual(provider.s3EndpointDnsName, 'vpce-xxxxxxx.xxxxxxx.vpce.amazonaws.com');
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
                        assert.deepEqual([bucket1, targetBucket, bucket3, bucket4], _getAllS3BucketsStubResponse);
                    });
            });
        });

        describe('_getAllS3Buckets', () => {
            it('should return an array of bucket names', () => provider.init(mockInitData)
                .then(() => provider._getAllS3Buckets())
                .then((response) => {
                    assert.deepEqual(response, [bucket1, targetBucket, bucket3, bucket4]);
                }));
        });

        describe('_getBucketTags', () => {
            it('should resolve on error if continueOnError is provided', () => provider.init(mockInitData)
                .then(() => provider._getBucketTags(targetBucket, { continueOnError: true })));

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

        it('should filter by instanceId (instance-id) when provided', () => {
            passedEIPParams = false;
            provider.init(mockInitData)
                .then(() => {
                    provider.instanceId = 'i-xyz';
                    return provider._getElasticIPs({ instanceId: true });
                })
                .then(() => {
                    assert.strictEqual(passedEIPParams['Filter.1.Name'], 'instance-id');
                    assert.strictEqual(passedEIPParams['Filter.1.Value'], provider.instanceId);
                });
        });

        it('should not throw if no Addresses for valid CIDR', () => {
            provider._getElasticIPs = sinon.stub().resolves({ Addresses: [] });
            return provider._getElasticIPsFromCIDR('10.0.0.0/32')
                .then((result) => {
                    assert.strictEqual(result.addresses.length, 0);
                });
        });

        it('should continue when one IP lookup fails and still resolve aggregate', () => {
            // Stub provider._getElasticIPs to reject for first IP and resolve for second
            provider._getElasticIPs = sinon.stub()
                .onFirstCall().rejects(new Error('temporary'))
                .onSecondCall()
                .resolves({
                    Addresses: [{
                        PublicIp: '54.1.1.1',
                        PrivateIpAddress: '10.10.0.1',
                        NetworkInterfaceId: 'eni-1',
                        AllocationId: 'eipalloc-1',
                        AssociationId: 'eipassoc-1',
                        Tags: []
                    }]
                });
            return provider._getElasticIPsFromCIDR('10.10.0.0/31') // two IPs: .0 and .1
                .then((result) => {
                    // One address should have been added
                    assert.strictEqual(result.addresses.length, 1);
                    assert.strictEqual(result.addresses[0].publicIpAddress, '54.1.1.1');
                });
        });
    });

    describe('function _createActionForElasticIpAddress early-return branches', () => {
        it('should return unchanged when EIP not found', () => {
            provider._getElasticIPs = sinon.stub().resolves(null);
            const resultAction = { publicAddresses: {} };
            return provider._createActionForElasticIpAddress(resultAction, {
                scopingAddress: '2.2.2.2',
                vipAddresses: ['10.0.0.1', '10.0.0.2']
            })
                .then((updated) => {
                    assert.deepStrictEqual(updated.publicAddresses, {});
                });
        });

        it('should return unchanged when Addresses array empty', () => {
            provider._getElasticIPs = sinon.stub().resolves({ Addresses: [] });
            const resultAction = { publicAddresses: {} };
            return provider._createActionForElasticIpAddress(resultAction, {
                scopingAddress: '2.2.2.2',
                vipAddresses: ['10.0.0.1', '10.0.0.2']
            })
                .then((updated) => {
                    assert.deepStrictEqual(updated.publicAddresses, {});
                });
        });

        it('should return unchanged when PrivateIpAddress not in provided vipAddresses', () => {
            provider._getElasticIPs = sinon.stub().resolves({
                Addresses: [{
                    PublicIp: '2.2.2.2',
                    PrivateIpAddress: '10.0.0.99',
                    AllocationId: 'alloc-1',
                    AssociationId: 'assoc-1',
                    Tags: []
                }]
            });
            const resultAction = { publicAddresses: {} };
            return provider._createActionForElasticIpAddress(resultAction, {
                scopingAddress: '2.2.2.2',
                vipAddresses: ['10.0.0.1', '10.0.0.2']
            })
                .then((updated) => {
                    assert.deepStrictEqual(updated.publicAddresses, {});
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

        it('should resolve _getSubnets with empty list branch', () => {
            provider.ec2ApiRequest = () => Promise.resolve({ Subnets: [] });
            return provider._getSubnets()
                .then(() => {
                    // provider.subnets should be set to empty container
                    assert.deepStrictEqual(provider.subnets.Subnets, []);
                });
        });
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

    describe('AWS _getIpv6Ec2ApiRequest branches', () => {
        it('should build AssignIpv6Addresses request', () => {
            provider.ec2ApiRequest = sinon.stub().resolves({ AssignedIpv6Addresses: ['2001:db8::1'] });
            return provider._getIpv6Ec2ApiRequest('AssignIpv6Addresses', 'eni-1', { Ipv6Addresses: ['2001:db8::1'] })
                .then((r) => {
                    assert.ok(r.AssignedIpv6Addresses);
                });
        });

        it('should build UnassignIpv6Addresses request', () => {
            provider.ec2ApiRequest = sinon.stub().resolves({ UnassignedIpv6Addresses: ['2001:db8::1'] });
            return provider._getIpv6Ec2ApiRequest('UnassignIpv6Addresses', 'eni-1', { Ipv6Addresses: ['2001:db8::1'] })
                .then((r) => {
                    assert.ok(r.UnassignedIpv6Addresses);
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

    describe('function _getDomainSuffix', () => {
        // Test for CN region domain suffix
        it('should return amazonaws.com.cn for cn region', () => {
            mockMetadata.region = 'cn-north-1';
            return provider.init(mockInitData)
                .then(() => provider._getDomainSuffix())
                .then(() => {
                    // For regions in China, the domain suffix should be amazonaws.com.cn
                    assert.strictEqual(provider.domainSuffix, 'amazonaws.com.cn', 'not equal');
                });
        });

        it('should return amazonaws.com for none-cn region', () => {
            mockMetadata.region = 'us-west-2';
            return provider.init(mockInitData)
                .then(() => provider._getDomainSuffix())
                .then(() => {
                    // For regions not in China, the domain suffix should be amazonaws.com
                    assert.strictEqual(provider.domainSuffix, 'amazonaws.com');
                });
        });
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

    describe('function _createActionForElasticPrefixIpAddress', () => {
        it('should resolve with correct resultAction for valid prefix address', () => {
            const addresses = {
                localAddresses: ['10.0.0.1'],
                failoverAddresses: ['10.0.0.2']
            };
            const resultAction = { publicAddresses: {} };
            const providedPrefixAddress = { scopingAddress: '10.0.0.0/28' };

            return provider._createActionForElasticPrefixIpAddress(addresses, resultAction, providedPrefixAddress)
                .then((actions) => {
                    assert.ok(actions.publicAddresses);
                    assert.ok(actions.publicAddresses['2.2.2.2']);
                    assert.strictEqual(actions.publicAddresses['2.2.2.2'].AllocationId, 'allocation-id');
                    assert.ok(actions.publicAddresses['2.2.2.2'].current);
                    assert.ok(actions.publicAddresses['2.2.2.2'].target);
                });
        });

        it('should assign target NetworkInterfaceId based on matching subnet & prefix', () => provider.init(mockInitData)
            .then(() => {
                provider._listNics = sinon.stub().resolves([
                    {
                        NetworkInterfaceId: 'eni-mine', SubnetId: 'subnet-1', PrivateIpAddress: '10.0.0.5', Ipv4Prefixes: [{ Ipv4Prefix: '10.0.0.0/28' }]
                    },
                    {
                        NetworkInterfaceId: 'eni-theirs', SubnetId: 'subnet-1', PrivateIpAddress: '10.0.0.6', Ipv4Prefixes: [{ Ipv4Prefix: '10.0.0.0/28' }]
                    }
                ]);
                provider._getElasticIPsFromCIDR = sinon.stub().resolves({
                    addresses: [{
                        publicIpAddress: '203.0.113.20',
                        privateIpAddress: '10.0.0.6',
                        allocationId: 'alloc-x'
                    }]
                });
                const addresses = { localAddresses: ['10.0.0.5'] };
                const resultAction = {
                    publicAddresses: {},
                    interfaces: { disassociate: [], associate: [] },
                    loadBalancerAddresses: {}
                };
                return provider._createActionForElasticPrefixIpAddress(addresses, resultAction, { scopingAddress: '10.0.0.0/28' });
            })
            .then((updated) => {
                assert.ok(updated.publicAddresses['203.0.113.20']);
                assert.strictEqual(updated.publicAddresses['203.0.113.20'].target.NetworkInterfaceId, 'eni-mine');
            }));
    });

    describe('AWS _getIpParamsByVersion prefix + ipv6 accumulation', () => {
        it('should separate ipv4 prefix, ipv4, and ipv6 addresses', () => provider.init(mockInitData)
            .then(() => {
                const addresses = [
                    { address: '10.0.0.8', ipVersion: 4 },
                    { address: '10.0.0.0/28', ipVersion: 4, prefix: true },
                    { address: '2001:db8::5', ipVersion: 6 }
                ];
                const params = provider._getIpParamsByVersion('eni-xyz', addresses);
                assert.deepStrictEqual(params.ipv4.PrivateIpAddresses, ['10.0.0.8']);
                assert.deepStrictEqual(params.ipv4Prefix.Ipv4Prefixes, ['10.0.0.0/28']);
                assert.deepStrictEqual(params.ipv6.Ipv6Addresses, ['2001:db8::5']);
            }));
    });

    describe('function _unassignPrivateIp4Addresses', () => {
        it('should resolve when unassigning valid IPv4 addresses', () => {
            const ipv4Params = { NetworkInterfaceId: 'eni-123', PrivateIpAddresses: ['10.0.0.2'] };
            const addresses = [{ address: '10.0.0.2', publicAddress: '1.2.3.4' }];

            provider._reassociatePublicAddressToNic = sinon.stub().resolves();

            return provider._unassignPrivateIp4Addresses(ipv4Params, addresses)
                .then((result) => {
                    assert.ok(result);
                });
        });

        it('should reject on AWS error', () => {
            const ipv4Params = { NetworkInterfaceId: 'eni-123', PrivateIpAddresses: ['10.0.0.2'] };
            const addresses = [{ address: '10.0.0.2', publicAddress: '1.2.3.4' }];

            provider._reassociatePublicAddressToNic = sinon.stub().rejects(new Error('AWS error'));

            return provider._unassignPrivateIp4Addresses(ipv4Params, addresses)
                .catch((err) => {
                    assert.ok(err);
                });
        });

        it('should include Ipv4Prefix.* params when prefixes supplied', () => {
            provider.ec2ApiRequest = sinon.stub().resolves({});
            provider._reassociatePublicAddressToNic = sinon.stub().resolves();
            const ipv4Params = {
                NetworkInterfaceId: 'eni-1',
                Ipv4Prefixes: ['10.0.0.0/28'],
                PrivateIpAddresses: ['10.0.0.8']
            };
            const addresses = [
                { address: '10.0.0.8', ipVersion: 4 },
                { address: '10.0.0.0/28', ipVersion: 4, prefix: true }
            ];
            let captured;
            provider.ec2ApiRequest = function (opts) {
                captured = opts.queryParams;
                return Promise.resolve({});
            };
            return provider._unassignPrivateIp4Addresses(ipv4Params, addresses)
                .then(() => {
                    assert.ok(captured['Ipv4Prefix.2']); // second param after PrivateIpAddress.1
                });
        });
    });

    describe('function _getPrefixedAddresses', () => {
        it('should resolve with prefixed addresses from AWS', () => {
            unitTestContext = unitTestContext || {};
            unitTestContext.DescribeNetworkInterfaces = {
                NetworkInterfaces: [
                    {
                        NetworkInterfaceId: 'eni-123',
                        Ipv4Prefixes: [
                            { Ipv4Prefix: '10.0.0.0/28' }
                        ],
                        PrivateIpAddresses: [
                            { Primary: false, PrivateIpAddress: '10.0.0.2' }
                        ]
                    }
                ]
            };

            return provider._getPrefixedAddresses()
                .then((result) => {
                    assert.ok(result['10.0.0.0/28']);
                    assert.strictEqual(result['10.0.0.0/28'].NetworkInterfaceId, 'eni-123');
                    assert.deepStrictEqual(result, { '10.0.0.0/28': { NetworkInterfaceId: 'eni-123' } });
                });
        });

        it('should reject on AWS error', () => {
            provider._describeNetworkInterfaces = sinon.stub().rejects(new Error('AWS error'));
            return provider._getPrefixedAddresses()
                .catch((err) => {
                    assert.ok(err);
                });
        });
    });
    describe('function _getS3Host', () => {
        it('should return S3 host with region', () => provider.init(mockMetadata)
            .then(() => provider._getS3Host())
            .then((result) => {
                assert.strictEqual(result, 's3.us-west.amazonaws.com');
            }));
        it('should return S3 host with bucket region if set', () => {
            mockMetadata.storageName = 's3BucketName.s3.us-east-2.amazonaws.com';
            provider.init(mockMetadata)
                .then(() => provider._getS3Host())
                .then((result) => {
                    assert.strictEqual(result, 's3.us-east-2.amazonaws.com');
                });
        });
        it('should return VPC endpoint DNS name if configured', () => {
            mockMetadata.storageName = 's3BucketName.s3.us-east-2.amazonaws.com';
            mockMetadata.storageDnsName = 'vpce-12345.s3.us-west-2.vpce.amazonaws.com';
            provider.init(mockMetadata)
                .then(() => provider._getS3Host())
                .then((result) => {
                    assert.strictEqual(result, 'bucket.vpce-12345.s3.us-west-2.vpce.amazonaws.com');
                });
        });
    });
    describe('function _getEc2Host', () => {
        it('should return Ec2 host with region', () => {
            mockMetadata.region = 'us-west';
            provider.init(mockMetadata)
                .then(() => provider._getEc2Host())
                .then((result) => {
                    assert.strictEqual(result, 'ec2.us-west.amazonaws.com');
                });
        });
        it('should return VPC endpoint DNS name if configured', () => {
            mockMetadata.ec2DnsName = 'vpce-12345.ec2.us-west-2.vpce.amazonaws.com';
            provider.init(mockMetadata)
                .then(() => provider._getEc2Host())
                .then((result) => {
                    assert.strictEqual(result, 'vpce-12345.ec2.us-west-2.vpce.amazonaws.com');
                });
        });
    });

    // -----------------------------------------------------------------------
    // Additional coverage tests
    // -----------------------------------------------------------------------

    describe('function getRegion', () => {
        it('should return the region', () => provider.init(mockMetadata)
            .then(() => {
                assert.strictEqual(provider.getRegion(), 'us-west');
            }));
    });

    describe('function makeBooleanEc2Request', () => {
        it('should send a boolean EC2 request and resolve', () => provider.init(mockMetadata)
            .then(() => provider.makeBooleanEc2Request({ Action: 'DescribeSubnets' }))
            .then((result) => {
                assert.ok(result !== undefined);
            }));
    });

    describe('function _replaceEc2Route', () => {
        it('should make a ReplaceRoute API call and parse XML response', () => provider.init(mockMetadata)
            .then(() => provider._replaceEc2Route({
                Action: 'ReplaceRoute',
                RouteTableId: 'rtb-123',
                DestinationCidrBlock: '10.0.0.0/8',
                NetworkInterfaceId: 'eni-123'
            }))
            .then((result) => {
                assert.ok(result !== undefined);
            }));
    });

    describe('function _getBucketTags error paths', () => {
        it('should reject when TagSet has no Key element and continueOnError is not set', () => {
            // makeRequest returns valid XML with a Tag that has no Key element, which
            // trips the "No tags found" throw. With continueOnError unset, the catch
            // handler must reject (the catch now returns the ternary instead of
            // swallowing the error and resolving with undefined).
            provider.makeRequest = sinon.stub().resolves(
                '<Tagging><TagSet><Tag><Value>v1</Value></Tag></TagSet></Tagging>'
            );
            const bucket = { name: 'my-bucket', region: 'us-west' };
            return provider._getBucketTags(bucket)
                .then(() => {
                    assert.fail('Expected _getBucketTags to reject when no Key element is present');
                })
                .catch((err) => {
                    assert.ok(/No tags found/.test(err.message), `unexpected error: ${err.message}`);
                });
        });

        it('should resolve with undefined when TagSet has no Key element and continueOnError is set', () => {
            // Same malformed response, but continueOnError: true means the catch
            // handler resolves (with undefined) instead of rejecting.
            provider.makeRequest = sinon.stub().resolves(
                '<Tagging><TagSet><Tag><Value>v1</Value></Tag></TagSet></Tagging>'
            );
            const bucket = { name: 'my-bucket', region: 'us-west' };
            return provider._getBucketTags(bucket, { continueOnError: true })
                .then((result) => {
                    assert.strictEqual(result, undefined);
                });
        });

        it('should use VPC endpoint host when s3EndpointDnsName is set', () => {
            provider.s3EndpointDnsName = 'vpce-s3.us-west.vpce.amazonaws.com';
            provider.s3_host = 'vpce-s3.us-west.vpce.amazonaws.com';
            provider.makeRequest = sinon.stub().resolves(
                '<Tagging><TagSet><Tag><Key>k1</Key><Value>v1</Value></Tag></TagSet></Tagging>'
            );
            const bucket = { name: 'my-bucket', region: 'us-west' };
            return provider._getBucketTags(bucket)
                .then((result) => {
                    assert.strictEqual(result.bucket.name, 'my-bucket');
                    // Verify host used VPC endpoint
                    const calledHost = provider.makeRequest.firstCall.args[0];
                    assert.ok(calledHost.includes('vpce-s3'));
                });
        });
    });

    describe('function _getSubnets error path', () => {
        it('should handle ec2ApiRequest failure gracefully', () => {
            provider.ec2ApiRequest = sinon.stub().rejects(new Error('describe subnets failed'));
            return provider._getSubnets()
                .then(() => {
                    // Should resolve even on error (catch handler swallows it)
                    assert.ok(true);
                });
        });
    });

    describe('function _disassociateAddressFromNic edge cases', () => {
        it('should resolve immediately when addresses is null', () => provider.init(mockMetadata)
            .then(() => provider._disassociateAddressFromNic('eni-123', null))
            .then(() => {
                assert.ok(true);
            }));

        it('should resolve immediately when addresses is empty array', () => provider.init(mockMetadata)
            .then(() => provider._disassociateAddressFromNic('eni-123', []))
            .then(() => {
                assert.ok(true);
            }));

        it('should resolve when all addresses have no address property', () => provider.init(mockMetadata)
            .then(() => provider._disassociateAddressFromNic('eni-123', [{ publicAddress: '1.2.3.4' }]))
            .then(() => {
                assert.ok(true);
            }));

        it('should handle IPv6 disassociation', () => {
            provider.ec2ApiRequest = sinon.stub().resolves({});
            provider._getIpv6Ec2ApiRequest = sinon.stub().resolves({});
            provider._unassignPrivateIp4Addresses = sinon.stub().resolves({});
            return provider._disassociateAddressFromNic('eni-123', [
                { address: '2001:db8::1', ipVersion: 6 }
            ]).then(() => {
                assert.ok(provider._getIpv6Ec2ApiRequest.calledOnce);
            });
        });

        it('should handle IPv4 prefix disassociation', () => {
            provider._unassignPrivateIp4Addresses = sinon.stub().resolves({});
            return provider._disassociateAddressFromNic('eni-123', [
                { address: '10.0.0.0/28', ipVersion: 4, prefix: true }
            ]).then(() => {
                assert.ok(provider._unassignPrivateIp4Addresses.calledOnce);
            });
        });

        it('should filter out addresses with null address property', () => {
            provider._unassignPrivateIp4Addresses = sinon.stub().resolves({});
            return provider._disassociateAddressFromNic('eni-123', [
                { address: null },
                { address: '10.0.0.5', ipVersion: 4 }
            ]).then(() => {
                assert.ok(provider._unassignPrivateIp4Addresses.calledOnce);
            });
        });
    });

    describe('function _associateAddressToNic edge cases', () => {
        it('should resolve immediately when addresses is null', () => provider.init(mockMetadata)
            .then(() => provider._associateAddressToNic('eni-123', null))
            .then(() => {
                assert.ok(true);
            }));

        it('should resolve immediately when addresses is empty array', () => provider.init(mockMetadata)
            .then(() => provider._associateAddressToNic('eni-123', []))
            .then(() => {
                assert.ok(true);
            }));

        it('should resolve when all addresses have no address property', () => provider.init(mockMetadata)
            .then(() => provider._associateAddressToNic('eni-123', [{ publicAddress: '1.2.3.4' }]))
            .then(() => {
                assert.ok(true);
            }));

        it('should handle IPv6 association', () => {
            provider._getIpv6Ec2ApiRequest = sinon.stub().resolves({});
            provider._assignPrivateIpv4Addresses = sinon.stub().resolves({});
            return provider._associateAddressToNic('eni-123', [
                { address: '2001:db8::1', ipVersion: 6 }
            ]).then(() => {
                assert.ok(provider._getIpv6Ec2ApiRequest.calledOnce);
            });
        });

        it('should handle IPv4 prefix association', () => {
            provider._assignPrivateIpv4Addresses = sinon.stub().resolves({});
            return provider._associateAddressToNic('eni-123', [
                { address: '10.0.0.0/28', ipVersion: 4, prefix: true }
            ]).then(() => {
                assert.ok(provider._assignPrivateIpv4Addresses.calledOnce);
            });
        });
    });

    describe('function _assignPrivateIpv4Addresses', () => {
        it('should assign IPv4 prefix addresses', () => {
            provider.ec2ApiRequest = sinon.stub().resolves({});
            const ipv4Params = {
                NetworkInterfaceId: 'eni-123',
                Ipv4Prefixes: ['10.0.0.0/28']
            };
            return provider._assignPrivateIpv4Addresses(ipv4Params, [
                { address: '10.0.0.0/28', prefix: true }
            ]).then(() => {
                assert.ok(provider.ec2ApiRequest.calledOnce);
                const callArgs = provider.ec2ApiRequest.firstCall.args[0];
                assert.strictEqual(callArgs.queryParams['Ipv4Prefix.1'], '10.0.0.0/28');
            });
        });

        it('should reassociate public address after assigning IPv4', () => {
            provider.ec2ApiRequest = sinon.stub().resolves({});
            provider._reassociatePublicAddressToNic = sinon.stub().resolves({});
            const ipv4Params = {
                NetworkInterfaceId: 'eni-123',
                PrivateIpAddresses: ['10.0.0.5']
            };
            return provider._assignPrivateIpv4Addresses(ipv4Params, [
                { address: '10.0.0.5', publicAddress: '1.2.3.4' }
            ]).then(() => {
                assert.ok(provider._reassociatePublicAddressToNic.calledOnce);
                assert.ok(provider._reassociatePublicAddressToNic.calledWith(
                    '1.2.3.4', 'eni-123', '10.0.0.5'
                ));
            });
        });
    });

    describe('function _reassociatePublicAddressToNic', () => {
        it('should disassociate then associate an EIP', () => {
            provider._getElasticIPs = sinon.stub().resolves({
                Addresses: [{ AllocationId: 'eipalloc-123', AssociationId: 'eipassoc-456' }]
            });
            provider._disassociatePublicAddress = sinon.stub().resolves(true);
            provider._associatePublicAddress = sinon.stub().resolves({});

            return provider._reassociatePublicAddressToNic('1.2.3.4', 'eni-789', '10.0.0.5')
                .then(() => {
                    assert.ok(provider._disassociatePublicAddress.calledWith('eipassoc-456'));
                    assert.ok(provider._associatePublicAddress.calledWith('eipalloc-123', 'eni-789', '10.0.0.5'));
                });
        });

        it('should skip disassociation when no AssociationId', () => {
            provider._getElasticIPs = sinon.stub().resolves({
                Addresses: [{ AllocationId: 'eipalloc-123' }]
            });
            provider._disassociatePublicAddress = sinon.stub().resolves(true);
            provider._associatePublicAddress = sinon.stub().resolves({});

            return provider._reassociatePublicAddressToNic('1.2.3.4', 'eni-789', '10.0.0.5')
                .then(() => {
                    assert.ok(provider._disassociatePublicAddress.notCalled);
                    assert.ok(provider._associatePublicAddress.calledOnce);
                });
        });
    });

    describe('function _reassociateAddresses', () => {
        it('should disassociate then associate private addresses', () => {
            provider._disassociateAddressFromNic = sinon.stub().resolves();
            provider._associateAddressToNic = sinon.stub().resolves();

            const operations = {
                disassociate: [{ networkInterfaceId: 'eni-1', addresses: [{ address: '10.0.0.5' }] }],
                associate: [{ networkInterfaceId: 'eni-2', addresses: [{ address: '10.0.0.5' }] }]
            };

            return provider._reassociateAddresses(operations)
                .then(() => {
                    assert.ok(provider._disassociateAddressFromNic.calledOnce);
                    assert.ok(provider._associateAddressToNic.calledOnce);
                });
        });
    });

    describe('function uploadDataToStorage with VPC endpoint', () => {
        it('should use VPC endpoint host for S3 upload', () => {
            provider.s3EndpointDnsName = 'vpce-s3.us-west.vpce.amazonaws.com';
            provider.s3BucketName = 'my-bucket';
            provider.s3BucketRegion = 'us-west';
            provider.s3_host = 's3.us-west.amazonaws.com';
            provider.s3FilePrefix = 'f5cloudfailover';
            provider.makeRequest = sinon.stub().resolves('ok');

            return provider.uploadDataToStorage('file.json', { key: 'value' })
                .then(() => {
                    const calledHost = provider.makeRequest.firstCall.args[0];
                    assert.ok(calledHost.includes('vpce-s3'));
                });
        });
    });

    describe('function downloadDataFromStorage with VPC endpoint', () => {
        it('should use VPC endpoint host for S3 download', () => {
            provider.s3EndpointDnsName = 'vpce-s3.us-west.vpce.amazonaws.com';
            provider.s3BucketName = 'my-bucket';
            provider.s3BucketRegion = 'us-west';
            provider.s3_host = 's3.us-west.amazonaws.com';
            provider.s3FilePrefix = 'f5cloudfailover';
            provider.makeRequest = sinon.stub();
            // First call: listObjects
            provider.makeRequest.onFirstCall().resolves(
                '<ListBucketResult><Contents><Key>f5cloudfailover/file.json</Key></Contents></ListBucketResult>'
            );
            // Second call: getObject - return raw string (gets returned as-is)
            provider.makeRequest.onSecondCall().resolves('{"key":"value"}');

            return provider.downloadDataFromStorage('file.json')
                .then((data) => {
                    const calledHost = provider.makeRequest.firstCall.args[0];
                    assert.ok(calledHost.includes('vpce-s3'));
                    // The response is returned as-is (string), not parsed
                    assert.strictEqual(data, '{"key":"value"}');
                });
        });

        it('should return empty object when file not found in S3', () => {
            provider.s3BucketName = 'my-bucket';
            provider.s3BucketRegion = 'us-west';
            provider.s3_host = 's3.us-west.amazonaws.com';
            provider.s3FilePrefix = 'f5cloudfailover';
            provider.makeRequest = sinon.stub().resolves(
                '<ListBucketResult></ListBucketResult>'
            );

            return provider.downloadDataFromStorage('missing.json')
                .then((data) => {
                    assert.deepStrictEqual(data, {});
                });
        });
    });

    describe('function init proxy branches', () => {
        it('should set proxyOptions when proxy host is configured', () => {
            sinon.restore();
            const Device = require('../../../src/nodejs/device.js');
            sinon.stub(Device.prototype, 'init').resolves();
            sinon.stub(Device.prototype, 'getProxySettings').resolves({
                host: 'proxy.example.com',
                port: 3128,
                protocol: 'http',
                username: '',
                password: ''
            });

            const p = new AWSCloudProvider(mockInitData);
            p.logger = sinon.stub();
            p.logger.info = sinon.stub();
            p.logger.debug = sinon.stub();
            p.logger.error = sinon.stub();
            p.logger.silly = sinon.stub();
            p.logger.warning = sinon.stub();
            p.maxRetries = 0;
            p.retryInterval = 100;

            util.makeRequest = sinon.stub()
                .callsFake((host, uri) => {
                    if (uri === '/latest/api/token') return Promise.resolve('token');
                    if (uri === '/latest/dynamic/instance-identity/document') {
                        return Promise.resolve(JSON.stringify(mockMetadata));
                    }
                    if (uri === '/latest/meta-data/iam/security-credentials/') {
                        return Promise.resolve('role');
                    }
                    if (uri === '/latest/meta-data/iam/security-credentials/role') {
                        return Promise.resolve(mockCredentials);
                    }
                    // S3 bucket discovery
                    if (host === 's3.us-west.amazonaws.com') {
                        return Promise.resolve(`<ListAllMyBucketsResult><Buckets>
                            <Bucket><Name>bucket2</Name><CreationDate>2021-01-01</CreationDate></Bucket>
                        </Buckets></ListAllMyBucketsResult>`);
                    }
                    if (uri === '/' && host.includes('bucket2')) {
                        return Promise.resolve(`<Tagging><TagSet><Tag>
                            <Key>sKey1</Key><Value>storageKey1</Value>
                        </Tag></TagSet></Tagging>`);
                    }
                    return Promise.resolve('{}');
                });

            return p.init(mockMetadata)
                .then(() => {
                    assert.ok(p.proxySettings);
                    assert.ok(p.proxyOptions);
                    assert.strictEqual(p.proxyOptions.host, 'proxy.example.com');
                    assert.strictEqual(p.proxyOptions.port, '3128');
                });
        });
    });

    describe('function _reassociatePublicAddresses additional branches', () => {
        it('should skip disassociation when no AssociationId present', () => {
            provider._disassociatePublicAddress = sinon.stub().resolves(true);
            provider._associatePublicAddress = sinon.stub().resolves({});
            const operations = {
                eip1: {
                    current: {},
                    AllocationId: 'eipalloc-1',
                    target: { NetworkInterfaceId: 'eni-1', PrivateIpAddress: '10.0.0.5' }
                }
            };
            return provider._reassociatePublicAddresses(operations)
                .then(() => {
                    assert.ok(provider._disassociatePublicAddress.notCalled);
                    assert.ok(provider._associatePublicAddress.calledOnce);
                });
        });

        it('should skip association when required fields are missing', () => {
            provider._disassociatePublicAddress = sinon.stub().resolves(true);
            provider._associatePublicAddress = sinon.stub().resolves({});
            const operations = {
                eip1: {
                    current: { AssociationId: 'eipassoc-1' },
                    target: {}
                    // Missing AllocationId, target NetworkInterfaceId, target PrivateIpAddress
                }
            };
            return provider._reassociatePublicAddresses(operations)
                .then(() => {
                    assert.ok(provider._disassociatePublicAddress.calledOnce);
                    assert.ok(provider._associatePublicAddress.notCalled);
                });
        });
    });

    describe('function _disassociatePublicAddress error handling', () => {
        it('should resolve false when EC2 API call fails', () => provider.init(mockMetadata)
            .then(() => {
                provider.ec2ApiRequest = sinon.stub().rejects(new Error('disassociate failed'));
                return provider._disassociatePublicAddress('eipassoc-123');
            })
            .then((result) => {
                assert.strictEqual(result, false);
            }));
    });

    describe('function _addFilterToParams', () => {
        it('should add scalar filter value wrapped in array', () => {
            const params = { Filters: [] };
            provider._addFilterToParams(params, 'instance-id', 'i-12345');
            assert.strictEqual(params.Filters[0].Name, 'instance-id');
            assert.deepStrictEqual(params.Filters[0].Values, ['i-12345']);
        });

        it('should add array filter value directly', () => {
            const params = { Filters: [] };
            provider._addFilterToParams(params, 'tag:Name', ['web1', 'web2']);
            assert.deepStrictEqual(params.Filters[0].Values, ['web1', 'web2']);
        });

        it('should initialize Filters array if not present', () => {
            const params = {};
            provider._addFilterToParams(params, 'vpc-id', 'vpc-123');
            assert.ok(Array.isArray(params.Filters));
            assert.strictEqual(params.Filters[0].Name, 'vpc-id');
        });
    });

    describe('function _listNics', () => {
        it('should call _describeNetworkInterfaces with tag filters', () => {
            provider._describeNetworkInterfaces = sinon.stub().resolves({ NetworkInterfaces: [] });
            return provider._listNics({ tags: { key1: 'value1' } })
                .then(() => {
                    assert.ok(provider._describeNetworkInterfaces.calledOnce);
                });
        });

        it('should include prefix filter when provided', () => {
            provider._describeNetworkInterfaces = sinon.stub().resolves({ NetworkInterfaces: [] });
            return provider._listNics({
                tags: { key1: 'value1' },
                prefix: '10.0.0.0/28'
            })
                .then(() => {
                    assert.ok(provider._describeNetworkInterfaces.calledOnce);
                });
        });
    });

    describe('function _getNetworkInterfaceId', () => {
        it('should return ENI for valid IPv4 address', () => {
            provider.addressTags = { key1: 'value1' };
            provider._listNics = sinon.stub().resolves([{ NetworkInterfaceId: 'eni-abc' }]);
            return provider._getNetworkInterfaceId('10.0.0.5')
                .then((result) => {
                    assert.strictEqual(result, 'eni-abc');
                });
        });
    });

    describe('function _getRouteTables', () => {
        it('should filter by instance ID when provided', () => {
            provider._describeRouteTables = sinon.stub().resolves({ RouteTables: [] });
            return provider._getRouteTables({ instanceId: 'i-12345' })
                .then(() => {
                    assert.ok(provider._describeRouteTables.calledOnce);
                });
        });

        it('should fetch all route tables when no instance ID', () => {
            provider._describeRouteTables = sinon.stub().resolves({ RouteTables: [] });
            return provider._getRouteTables({})
                .then(() => {
                    assert.ok(provider._describeRouteTables.calledOnce);
                });
        });
    });

    describe('function _updateAddresses', () => {
        it('should resolve immediately for empty operations', () => {
            provider._reassociatePublicAddresses = sinon.stub().resolves();
            provider._reassociateAddresses = sinon.stub().resolves();
            return provider._updateAddresses({})
                .then(() => {
                    assert.ok(provider._reassociatePublicAddresses.notCalled);
                });
        });

        it('should call reassociate for public and private operations', () => {
            provider._reassociatePublicAddresses = sinon.stub().resolves();
            provider._reassociateAddresses = sinon.stub().resolves();
            const ops = {
                publicAddresses: { eip1: {} },
                interfaces: { disassociate: [], associate: [] }
            };
            return provider._updateAddresses(ops)
                .then(() => {
                    assert.ok(provider._reassociatePublicAddresses.calledOnce);
                    assert.ok(provider._reassociateAddresses.calledOnce);
                });
        });
    });

    describe('function _updateRoutes', () => {
        it('should resolve immediately for empty operations', () => {
            provider._updateRouteTable = sinon.stub().resolves();
            return provider._updateRoutes([])
                .then(() => {
                    assert.ok(provider._updateRouteTable.notCalled);
                });
        });

        it('should call _updateRouteTable for each operation', () => {
            provider._updateRouteTable = sinon.stub().resolves();
            return provider._updateRoutes([{
                routeTableId: 'rtb-1',
                networkInterfaceId: 'eni-1',
                routeAddress: '10.0.0.0/8',
                ipVersion: '4'
            }])
                .then(() => {
                    assert.ok(provider._updateRouteTable.calledOnce);
                    assert.ok(provider._updateRouteTable.calledWith('rtb-1', 'eni-1', '10.0.0.0/8', '4'));
                });
        });
    });

    describe('function _updateRouteTable', () => {
        it('should use DestinationCidrBlock for IPv4', () => {
            provider._replaceRoute = sinon.stub().resolves({});
            return provider._updateRouteTable('rtb-1', 'eni-1', '10.0.0.0/8', '4')
                .then(() => {
                    const args = provider._replaceRoute.firstCall.args[0];
                    assert.strictEqual(args.DestinationCidrBlock, '10.0.0.0/8');
                    assert.strictEqual(args.DestinationIpv6CidrBlock, undefined);
                });
        });

        it('should use DestinationIpv6CidrBlock for IPv6', () => {
            provider._replaceRoute = sinon.stub().resolves({});
            return provider._updateRouteTable('rtb-1', 'eni-1', '2001:db8::/32', '6')
                .then(() => {
                    const args = provider._replaceRoute.firstCall.args[0];
                    assert.strictEqual(args.DestinationIpv6CidrBlock, '2001:db8::/32');
                    assert.strictEqual(args.DestinationCidrBlock, undefined);
                });
        });
    });

    describe('function _getUpdateOperationObject', () => {
        it('should return empty object when no update required', () => {
            provider._getNetworkInterfaceId = sinon.stub().resolves('eni-already-correct');
            const routeAddresses = ['10.0.0.0/8'];
            const address = '10.0.0.1';
            const routeTable = { RouteTableId: 'rtb-1' };
            const route = {
                DestinationCidrBlock: '10.0.0.0/8',
                NetworkInterfaceId: 'eni-already-correct'
            };
            return provider._getUpdateOperationObject(routeAddresses, address, routeTable, route)
                .then((result) => {
                    // should be empty because eni already matches
                    assert.deepStrictEqual(result, {});
                });
        });

        it('should return operation object when update is required', () => {
            provider._getNetworkInterfaceId = sinon.stub().resolves('eni-new');
            const routeAddresses = ['10.0.0.0/8'];
            const address = '10.0.0.1';
            const routeTable = { RouteTableId: 'rtb-1' };
            const route = {
                DestinationCidrBlock: '10.0.0.0/8',
                NetworkInterfaceId: 'eni-old'
            };
            return provider._getUpdateOperationObject(routeAddresses, address, routeTable, route)
                .then((result) => {
                    assert.strictEqual(result.routeTableId, 'rtb-1');
                    assert.strictEqual(result.networkInterfaceId, 'eni-new');
                    assert.strictEqual(result.routeAddress, '10.0.0.0/8');
                });
        });
    });

    describe('function _getIpParamsByVersion additional cases', () => {
        it('should handle ipv4 address without prefix', () => {
            const result = provider._getIpParamsByVersion('eni-123', [
                { address: '10.0.0.5', ipVersion: 4, prefix: false }
            ]);
            assert.ok(result.ipv4.PrivateIpAddresses.length > 0);
            assert.strictEqual(result.ipv4.PrivateIpAddresses[0], '10.0.0.5');
        });

        it('should handle address with no address property', () => {
            const result = provider._getIpParamsByVersion('eni-123', [
                { publicAddress: '1.2.3.4' }
            ]);
            // Should not add to any category
            assert.strictEqual(result.ipv4.PrivateIpAddresses.length, 0);
            assert.strictEqual(result.ipv6.Ipv6Addresses.length, 0);
        });
    });

    describe('function _checkForNicOperations edge cases', () => {
        it('should handle undefined subnets', () => {
            const myNic = { SubnetId: 'subnet-1', PrivateIpAddresses: [], Ipv6Addresses: [] };
            const theirNic = { SubnetId: 'subnet-1', PrivateIpAddresses: [], Ipv6Addresses: [] };
            provider.subnets = undefined;
            const result = provider._checkForNicOperations(myNic, theirNic, []);
            assert.ok(result);
            assert.deepStrictEqual(result.disassociate.addresses, []);
            assert.deepStrictEqual(result.associate.addresses, []);
        });

        it('should handle empty subnets object', () => {
            const myNic = { SubnetId: 'subnet-1', PrivateIpAddresses: [], Ipv6Addresses: [] };
            const theirNic = { SubnetId: 'subnet-1', PrivateIpAddresses: [], Ipv6Addresses: [] };
            provider.subnets = {};
            const result = provider._checkForNicOperations(myNic, theirNic, []);
            assert.ok(result);
            assert.deepStrictEqual(result.disassociate.addresses, []);
            assert.deepStrictEqual(result.associate.addresses, []);
        });

        it('should handle empty subnets array', () => {
            const myNic = { SubnetId: 'subnet-1', PrivateIpAddresses: [], Ipv6Addresses: [] };
            const theirNic = { SubnetId: 'subnet-1', PrivateIpAddresses: [], Ipv6Addresses: [] };
            provider.subnets = { Subnets: [] };
            const result = provider._checkForNicOperations(myNic, theirNic, []);
            assert.ok(result);
            assert.deepStrictEqual(result.disassociate.addresses, []);
            assert.deepStrictEqual(result.associate.addresses, []);
        });

        it('should match secondary IPv4 addresses from their NIC with subnet info', () => {
            const myNic = {
                SubnetId: 'subnet-1',
                PrivateIpAddress: '10.0.0.4',
                PrivateIpAddresses: [
                    { PrivateIpAddress: '10.0.0.4', Primary: true }
                ],
                Ipv6Addresses: []
            };
            const theirNic = {
                SubnetId: 'subnet-1',
                PrivateIpAddress: '10.0.0.5',
                PrivateIpAddresses: [
                    { PrivateIpAddress: '10.0.0.5', Primary: true },
                    { PrivateIpAddress: '10.0.0.10', Primary: false }
                ],
                Ipv6Addresses: []
            };
            provider.subnets = {
                Subnets: [{ SubnetId: 'subnet-1', CidrBlock: '10.0.0.0/24' }]
            };
            const failoverAddresses = ['10.0.0.10'];
            const result = provider._checkForNicOperations(myNic, theirNic, failoverAddresses);
            assert.ok(result);
            // Should find the secondary address to move
            assert.ok(result.disassociate.addresses.length > 0);
            assert.strictEqual(result.disassociate.addresses[0].address, '10.0.0.10');
        });
    });

    describe('function discoverAddresses', () => {
        it('should call _discoverAddressOperations', () => {
            provider._discoverAddressOperations = sinon.stub().resolves({ publicAddresses: {} });
            return provider.discoverAddresses({
                localAddresses: ['10.0.0.1'],
                failoverAddresses: ['10.0.0.2']
            })
                .then((result) => {
                    assert.ok(provider._discoverAddressOperations.calledOnce);
                    assert.ok(result);
                });
        });
    });

    describe('function _discoverAddressOperations', () => {
        it('should call AWS APIs and return operations', () => {
            provider._getElasticIPs = sinon.stub().resolves({ Addresses: [] });
            provider._getPrivateSecondaryIPs = sinon.stub().resolves({});
            provider._listNics = sinon.stub().resolves([]);
            provider._getPrefixedAddresses = sinon.stub().resolves([]);
            provider._getSubnets = sinon.stub().resolves();
            provider._generatePublicAddressOperations = sinon.stub().returns({});
            provider._generateAddressOperations = sinon.stub().returns({
                publicAddresses: {}, interfaces: {}
            });
            provider._parseNics = sinon.stub().returns({ mine: [], theirs: [] });

            return provider._discoverAddressOperations(['10.0.0.1'], ['10.0.0.2'])
                .then((result) => {
                    assert.ok(result);
                    assert.ok(provider._getElasticIPs.calledOnce);
                });
        });
    });

    describe('error path tests for catch handler coverage', () => {
        it('_fetchMetadataSessionToken should reject on error', () => {
            util.makeRequest = sinon.stub().rejects(new Error('metadata fail'));
            return provider._fetchMetadataSessionToken()
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('metadata fail')));
        });

        it('_getCredentials should reject on error', () => {
            util.makeRequest = sinon.stub().rejects(new Error('cred fail'));
            return provider._getCredentials()
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('cred fail')));
        });

        it('_getAuthHeaders should reject on error', () => {
            provider._sessionToken = null;
            provider._fetchMetadataSessionToken = sinon.stub().rejects(new Error('auth fail'));
            return provider._getAuthHeaders({})
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('auth fail')));
        });

        it('makeRequest should reject on error', () => {
            provider._getAuthHeaders = sinon.stub().rejects(new Error('request fail'));
            return provider.makeRequest('host', '/path', {})
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('request fail')));
        });

        it('uploadDataToStorage should reject on error', () => {
            provider.s3BucketName = 'bucket';
            provider.s3_host = 's3.us-west.amazonaws.com';
            provider.s3BucketRegion = 'us-west';
            provider.s3FilePrefix = 'f5cloudfailover';
            provider.makeRequest = sinon.stub().rejects(new Error('upload fail'));
            return provider.uploadDataToStorage('file.json', {})
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('upload fail')));
        });

        it('downloadDataFromStorage should reject on error', () => {
            provider.s3BucketName = 'bucket';
            provider.s3_host = 's3.us-west.amazonaws.com';
            provider.s3BucketRegion = 'us-west';
            provider.s3FilePrefix = 'f5cloudfailover';
            provider.makeRequest = sinon.stub().rejects(new Error('download fail'));
            return provider.downloadDataFromStorage('file.json')
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('download fail')));
        });

        it('updateAddresses should reject when _updateAddresses fails', () => {
            provider._updateAddresses = sinon.stub().rejects(new Error('update fail'));
            return provider.updateAddresses({ updateOperations: { ops: true } })
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('update fail')));
        });

        it('updateAddresses should reject when _discoverAddressOperations fails', () => {
            provider._discoverAddressOperations = sinon.stub().rejects(new Error('discover fail'));
            return provider.updateAddresses({})
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('discover fail')));
        });

        it('discoverAddresses should reject on error', () => {
            provider._discoverAddressOperations = sinon.stub().rejects(new Error('disc fail'));
            return provider.discoverAddresses({})
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('disc fail')));
        });

        it('_discoverAddressOperations should reject on error', () => {
            provider._getElasticIPs = sinon.stub().rejects(new Error('eip fail'));
            return provider._discoverAddressOperations([], [])
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('eip fail')));
        });

        it('_updateAddresses should reject on error', () => {
            provider._reassociatePublicAddresses = sinon.stub().rejects(new Error('reassoc fail'));
            return provider._updateAddresses({ publicAddresses: { e: {} }, interfaces: {} })
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('reassoc fail')));
        });

        it('_updateRoutes should reject on error', () => {
            provider._updateRouteTable = sinon.stub().rejects(new Error('route fail'));
            return provider._updateRoutes([{
                routeTableId: 'r',
                networkInterfaceId: 'e',
                routeAddress: 'c',
                ipVersion: '4'
            }])
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('route fail')));
        });

        it('_getUpdateOperationObject should reject on error', () => {
            provider._getNetworkInterfaceId = sinon.stub().rejects(new Error('nic fail'));
            return provider._getUpdateOperationObject(['10.0.0.0/8'], '10.0.0.1', { RouteTableId: 'r' }, { DestinationCidrBlock: '10.0.0.0/8' })
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('nic fail')));
        });

        it('_getNetworkInterfaceId should reject on error', () => {
            provider.addressTags = {};
            provider._listNics = sinon.stub().rejects(new Error('list fail'));
            return provider._getNetworkInterfaceId('10.0.0.5')
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('list fail')));
        });

        it('_getRouteTables should reject on error', () => {
            provider._describeRouteTables = sinon.stub().rejects(new Error('rt fail'));
            return provider._getRouteTables({})
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('rt fail')));
        });

        it('_reassociatePublicAddresses should reject on error', () => {
            provider._disassociatePublicAddress = sinon.stub().rejects(new Error('disassoc fail'));
            return provider._reassociatePublicAddresses({ eip1: { current: { AssociationId: 'a' }, target: {} } })
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('disassoc fail')));
        });

        it('_reassociatePublicAddressToNic should reject on error', () => {
            provider._getElasticIPs = sinon.stub().rejects(new Error('eip fail'));
            return provider._reassociatePublicAddressToNic('1.2.3.4', 'eni-1', '10.0.0.5')
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('eip fail')));
        });

        it('_reassociateAddresses should reject on error', () => {
            provider._disassociateAddressFromNic = sinon.stub().rejects(new Error('disassoc fail'));
            return provider._reassociateAddresses({
                disassociate: [{ networkInterfaceId: 'e', addresses: [] }],
                associate: []
            })
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('disassoc fail')));
        });

        it('_disassociateAddressFromNic should reject on error', () => {
            provider._getIpv6Ec2ApiRequest = sinon.stub().rejects(new Error('ipv6 fail'));
            return provider._disassociateAddressFromNic('eni-1', [{ address: '2001:db8::1', ipVersion: 6 }])
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('ipv6 fail')));
        });

        it('_associateAddressToNic should reject on error', () => {
            provider._getIpv6Ec2ApiRequest = sinon.stub().rejects(new Error('ipv6 fail'));
            return provider._associateAddressToNic('eni-1', [{ address: '2001:db8::1', ipVersion: 6 }])
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('ipv6 fail')));
        });

        it('_assignPrivateIpv4Addresses should reject on error', () => {
            provider.ec2ApiRequest = sinon.stub().rejects(new Error('assign fail'));
            return provider._assignPrivateIpv4Addresses(
                { NetworkInterfaceId: 'eni-1', PrivateIpAddresses: ['10.0.0.5'] },
                [{ address: '10.0.0.5' }]
            )
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('assign fail')));
        });

        it('_unassignPrivateIp4Addresses should reject via catch', () => {
            provider.ec2ApiRequest = sinon.stub().rejects(new Error('unassign fail'));
            return provider._unassignPrivateIp4Addresses(
                { NetworkInterfaceId: 'eni-1', PrivateIpAddresses: ['10.0.0.5'] },
                [{ address: '10.0.0.5' }]
            )
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('unassign fail')));
        });

        it('_listNics should reject on error', () => {
            provider._describeNetworkInterfaces = sinon.stub().rejects(new Error('nic fail'));
            return provider._listNics({ tags: {} })
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('nic fail')));
        });

        it('_getBucketRegion should reject on error', () => {
            provider.makeRequest = sinon.stub().rejects(new Error('region fail'));
            return provider._getBucketRegion('my-bucket')
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('region fail')));
        });

        it('getAssociatedAddressAndRouteInfo should reject on error', () => {
            provider._describeInstance = sinon.stub().rejects(new Error('describe fail'));
            return provider.getAssociatedAddressAndRouteInfo(true, true)
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('describe fail')));
        });

        it('_createActionsForAddressAssociationDisassociation should reject on error', () => {
            provider._listNics = sinon.stub().rejects(new Error('list fail'));
            return provider._createActionsForAddressAssociationDisassociation([], [])
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('list fail')));
        });

        it('_createActionForElasticIpAddress should reject on error', () => {
            provider._getElasticIPs = sinon.stub().rejects(new Error('eip fail'));
            const action = { publicAddresses: [] };
            return provider._createActionForElasticIpAddress(action, { vipAddresses: ['1.1.1.1', '2.2.2.2'] })
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message.includes('eip fail')));
        });

        it('_discoverRouteOperationsPerGroup should reject on error', () => {
            provider._getNetworkInterfaceId = sinon.stub().rejects(new Error('nic fail'));
            const routeGroup = {
                routeAddressRanges: [{ routeAddresses: ['10.0.0.0/8'] }]
            };
            const routeTables = [{
                RouteTableId: 'rtb-1',
                Routes: [{ DestinationCidrBlock: '10.0.0.0/8', NetworkInterfaceId: 'eni-old' }]
            }];
            return provider._discoverRouteOperationsPerGroup(['10.0.0.1'], routeGroup, routeTables)
                .then(() => assert.fail('should reject'))
                .catch((err) => assert.ok(err.message));
        });
    });

    describe('function getAssociatedAddressAndRouteInfo edge cases', () => {
        it('should handle EIPs associated with secondary addresses', () => {
            provider._describeInstance = sinon.stub().resolves({
                Reservations: [{
                    Instances: [{
                        NetworkInterfaces: [{
                            NetworkInterfaceId: 'eni-1',
                            PrivateIpAddresses: [
                                { PrivateIpAddress: '10.0.0.4', Primary: true },
                                {
                                    PrivateIpAddress: '10.0.0.5',
                                    Primary: false,
                                    Association: { PublicIp: '1.2.3.4' }
                                }
                            ]
                        }]
                    }]
                }]
            });
            provider._getElasticIPs = sinon.stub().resolves({
                Addresses: [{
                    PublicIp: '1.2.3.4',
                    PrivateIpAddress: '10.0.0.5',
                    Tags: [{ Key: 'Name', Value: 'test' }]
                }]
            });
            provider._getRouteTables = sinon.stub().resolves([]);

            return provider.getAssociatedAddressAndRouteInfo(true, true)
                .then((result) => {
                    assert.ok(result.addresses);
                    assert.ok(result.routes !== undefined);
                });
        });

        it('should handle no EIPs found', () => {
            provider._describeInstance = sinon.stub().resolves({
                Reservations: [{
                    Instances: [{
                        NetworkInterfaces: [{
                            NetworkInterfaceId: 'eni-1',
                            PrivateIpAddresses: [
                                { PrivateIpAddress: '10.0.0.4', Primary: true }
                            ]
                        }]
                    }]
                }]
            });
            provider._getElasticIPs = sinon.stub().resolves({ Addresses: [] });
            provider._getRouteTables = sinon.stub().resolves([]);

            return provider.getAssociatedAddressAndRouteInfo(true, false)
                .then((result) => {
                    assert.ok(result.addresses);
                });
        });
    });
});
