/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');
const sinon = require('sinon');

/* eslint-disable global-require */

describe('Provider - Abstract', () => {
    let Provider;
    let provider;

    before(() => {
        Provider = require('../../../src/nodejs/providers/abstract/cloud.js').AbstractCloud;
    });
    beforeEach(() => {
        provider = new Provider('test-cloud');
        provider.logger = sinon.stub();
        provider.logger.error = sinon.stub();
        provider.logger.warning = sinon.stub();
        provider.logger.info = sinon.stub();
        provider.logger.debug = sinon.stub();
        provider.logger.verbose = sinon.stub();
        provider.logger.silly = sinon.stub();
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });
    afterEach(() => {
        sinon.restore();
    });

    it('should instantiate provider with name and defaults', () => {
        assert.strictEqual(provider.environment, 'test-cloud');
        assert.strictEqual(provider.maxRetries, 50);
        assert.strictEqual(provider.retryInterval, 5000);
    });

    it('should instantiate provider with custom logger option', () => {
        const customLogger = { info: sinon.stub() };
        const p = new Provider('test', { logger: customLogger });
        assert.strictEqual(p.logger, customLogger);
    });

    it('should instantiate provider without options', () => {
        const p = new Provider('test');
        assert.strictEqual(p.environment, 'test');
    });

    it('should check abstract methods that throw', () => {
        const methods = [
            'updateAddresses',
            'uploadDataToStorage',
            'downloadDataFromStorage',
            'getRegion',
            'discoverAddresses',
            'discoverAddressOperationsUsingDefinitions',
            'getAssociatedAddressAndRouteInfo',
            '_checkForNicOperations',
            '_createResourceID'
        ];
        methods.forEach((func) => {
            assert.throws(
                () => {
                    provider[func]();
                },
                (err) => {
                    if (err.message.includes('Method must be implemented in child class')) {
                        return true;
                    }
                    return false;
                },
                'unexpected error'
            );
        });
    });

    describe('init', () => {
        it('should set defaults when called with no options', () => {
            provider.init();
            assert.deepStrictEqual(provider.addressTags, {});
            assert.strictEqual(provider.addressTagsRequired, false);
            assert.deepStrictEqual(provider.customEnvironment, {});
            assert.strictEqual(provider.proxySettings, null);
            assert.deepStrictEqual(provider.routeGroupDefinitions, {});
            assert.deepStrictEqual(provider.storageTags, {});
            assert.strictEqual(provider.storageName, '');
            assert.strictEqual(provider.storageEncryption, null);
            assert.deepStrictEqual(provider.subnets, {});
            assert.strictEqual(provider.trustedCertBundle, '');
        });

        it('should set values from provided options', () => {
            provider.init({
                addressTags: { tag1: 'val1' },
                addressTagsRequired: true,
                customEnvironment: { name: 'custom' },
                proxySettings: { host: 'proxy.local', port: 8080 },
                routeGroupDefinitions: [{ routeTags: {} }],
                storageTags: { storageTag: 'val' },
                storageName: 'my-storage',
                storageEncryption: { serverSide: true },
                subnets: { sub1: 'subnet-123' },
                trustedCertBundle: '/path/to/cert'
            });
            assert.deepStrictEqual(provider.addressTags, { tag1: 'val1' });
            assert.strictEqual(provider.addressTagsRequired, true);
            assert.deepStrictEqual(provider.customEnvironment, { name: 'custom' });
            assert.deepStrictEqual(provider.proxySettings, { host: 'proxy.local', port: 8080 });
            assert.deepStrictEqual(provider.routeGroupDefinitions, [{ routeTags: {} }]);
            assert.deepStrictEqual(provider.storageTags, { storageTag: 'val' });
            assert.strictEqual(provider.storageName, 'my-storage');
            assert.deepStrictEqual(provider.storageEncryption, { serverSide: true });
            assert.deepStrictEqual(provider.subnets, { sub1: 'subnet-123' });
            assert.strictEqual(provider.trustedCertBundle, '/path/to/cert');
        });
    });

    describe('_formatProxyUrl', () => {
        it('should format basic URL', () => {
            const proxyUrl = provider._formatProxyUrl({ protocol: 'http', host: 'proxy.local', port: 3128 });
            assert.strictEqual(proxyUrl, 'http://proxy.local:3128');
        });

        it('should format HTTPS URL (by default)', () => {
            const proxyUrl = provider._formatProxyUrl({ host: 'proxy.local', port: 3128 });
            assert.strictEqual(proxyUrl, 'https://proxy.local:3128');
        });

        it('should format URL with authentication info', () => {
            const proxyUrl = provider._formatProxyUrl({
                protocol: 'https',
                host: 'proxy.local',
                port: 3128,
                username: 'proxyuser',
                password: 'apassword'
            });
            assert.strictEqual(proxyUrl, 'https://proxyuser:apassword@proxy.local:3128');
        });

        it('should throw when host is missing', () => {
            assert.throws(
                () => provider._formatProxyUrl({ port: 3128 }),
                (err) => err.message.includes('Host must be provided')
            );
        });

        it('should throw when port is missing', () => {
            assert.throws(
                () => provider._formatProxyUrl({ host: 'proxy.local' }),
                (err) => err.message.includes('Port must be provided')
            );
        });

        it('should omit auth when only username is provided', () => {
            const proxyUrl = provider._formatProxyUrl({
                host: 'proxy.local',
                port: 3128,
                username: 'user'
            });
            assert.strictEqual(proxyUrl, 'https://proxy.local:3128');
        });

        it('should omit auth when only password is provided', () => {
            const proxyUrl = provider._formatProxyUrl({
                host: 'proxy.local',
                port: 3128,
                password: 'pass'
            });
            assert.strictEqual(proxyUrl, 'https://proxy.local:3128');
        });
    });

    describe('_discoverNextHopAddress', () => {
        it('should return next hop from static items', () => {
            const result = provider._discoverNextHopAddress(
                ['10.0.1.1', '10.0.1.2'],
                {},
                { type: 'static', items: ['10.0.1.1', '10.0.1.3'] }
            );
            assert.strictEqual(result, '10.0.1.1');
        });

        it('should return next hop from routeTag with comma-separated string', () => {
            const result = provider._discoverNextHopAddress(
                ['10.0.1.2'],
                { F5_SELF_IPS: '10.0.1.1, 10.0.1.2' },
                { type: 'routeTag', tag: 'F5_SELF_IPS' }
            );
            assert.strictEqual(result, '10.0.1.2');
        });

        it('should return next hop from routeTag with array value', () => {
            // Bypass _normalizeTags which calls .trim() on values - provide
            // tags already normalized so the array value reaches the isArray branch
            sinon.stub(provider, '_normalizeTags').callsFake((t) => t);
            const result = provider._discoverNextHopAddress(
                ['10.0.1.2'],
                { F5_SELF_IPS: ['10.0.1.1', '10.0.1.2'] },
                { type: 'routeTag', tag: 'F5_SELF_IPS' }
            );
            assert.strictEqual(result, '10.0.1.2');
        });

        it('should log warning and throw when routeTag does not exist on route table', () => {
            // SOURCE DEFECT: when the tag is missing, _discoverNextHopAddress logs a
            // warning (implying graceful handling) but then falls through and calls
            // .split() on the undefined tag value, throwing a TypeError instead of
            // returning gracefully. This test pins the current (buggy) crash behavior;
            // the source should default potentialAddresses to [] when the tag is absent.
            assert.throws(
                () => provider._discoverNextHopAddress(
                    ['10.0.1.1'],
                    {},
                    { type: 'routeTag', tag: 'MISSING_TAG' }
                ),
                (err) => err instanceof TypeError
            );
            assert.ok(provider.logger.warning.calledWith('expected tag: MISSING_TAG does not exist on route table'));
        });

        it('should log warning when no matching next hop address is found', () => {
            const result = provider._discoverNextHopAddress(
                ['10.0.1.99'],
                {},
                { type: 'static', items: ['10.0.1.1', '10.0.1.2'] }
            );
            assert.strictEqual(result, undefined);
            assert.ok(provider.logger.warning.called);
        });

        it('should throw for invalid discovery type', () => {
            assert.throws(
                () => provider._discoverNextHopAddress([], {}, { type: 'invalid' }),
                (err) => err.message.includes('Invalid discovery type was provided: invalid')
            );
        });

        it('should handle routeTag with AWS-style array tags', () => {
            const result = provider._discoverNextHopAddress(
                ['10.0.1.1'],
                [{ Key: 'F5_SELF_IPS', Value: '10.0.1.1,10.0.1.2' }],
                { type: 'routeTag', tag: 'F5_SELF_IPS' }
            );
            assert.strictEqual(result, '10.0.1.1');
        });
    });

    describe('_discoverRouteOperations', () => {
        beforeEach(() => {
            provider._getRouteTables = sinon.stub().resolves([]);
            provider._discoverRouteOperationsPerGroup = sinon.stub().resolves([]);
        });

        it('should aggregate operations from multiple route groups', () => {
            provider.routeGroupDefinitions = [
                { routeTags: { F5_LABEL: 'foo' } },
                { routeTags: { F5_LABEL: 'bar' } }
            ];

            return provider._discoverRouteOperations(['10.0.1.1'])
                .then((result) => {
                    assert.ok(result.operations);
                    assert.deepStrictEqual(result.operations, []);
                    assert.strictEqual(provider._discoverRouteOperationsPerGroup.callCount, 2);
                });
        });

        it('should flatten nested operations from groups', () => {
            provider.routeGroupDefinitions = [{ routeTags: {} }];
            provider._discoverRouteOperationsPerGroup = sinon.stub().resolves([
                { name: 'op1' },
                { name: 'op2' }
            ]);

            return provider._discoverRouteOperations(['10.0.1.1'])
                .then((result) => {
                    assert.strictEqual(result.operations.length, 2);
                    assert.strictEqual(result.operations[0].name, 'op1');
                });
        });

        it('should reject when _getRouteTables fails', () => {
            provider.routeGroupDefinitions = [];
            provider._getRouteTables = sinon.stub().rejects(new Error('rt-error'));

            return provider._discoverRouteOperations(['10.0.1.1'])
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'rt-error');
                });
        });
    });

    describe('updateRoutes', () => {
        it('should discover only when discoverOnly is true', () => {
            provider._discoverRouteOperations = sinon.stub()
                .resolves({ operations: [{ name: 'op1' }] });

            return provider.updateRoutes({ discoverOnly: true, localAddresses: ['10.0.1.1'] })
                .then((result) => {
                    assert.ok(provider._discoverRouteOperations.calledOnce);
                    assert.strictEqual(result.operations[0].name, 'op1');
                });
        });

        it('should update when updateOperations is provided', () => {
            provider._updateRoutes = sinon.stub().resolves();

            return provider.updateRoutes({ updateOperations: { operations: ['op1'] } })
                .then(() => {
                    assert.ok(provider._updateRoutes.calledWith(['op1']));
                });
        });

        it('should discover and update by default', () => {
            provider._discoverRouteOperations = sinon.stub()
                .resolves({ operations: ['op1'] });
            provider._updateRoutes = sinon.stub().resolves();

            return provider.updateRoutes({ localAddresses: ['10.0.1.1'] })
                .then(() => {
                    assert.ok(provider._updateRoutes.calledWith(['op1']));
                });
        });

        it('should use empty defaults when called with no options', () => {
            provider._discoverRouteOperations = sinon.stub()
                .resolves({ operations: [] });
            provider._updateRoutes = sinon.stub().resolves();

            return provider.updateRoutes()
                .then(() => {
                    assert.ok(provider._discoverRouteOperations.calledWith([]));
                });
        });

        it('should reject when discoverOnly discovery fails', () => {
            provider._discoverRouteOperations = sinon.stub()
                .rejects(new Error('discover-error'));

            return provider.updateRoutes({ discoverOnly: true })
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'discover-error');
                });
        });

        it('should reject when updateOperations update fails', () => {
            provider._updateRoutes = sinon.stub()
                .rejects(new Error('update-error'));

            return provider.updateRoutes({ updateOperations: { operations: [] } })
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'update-error');
                });
        });

        it('should reject when default discover-and-update fails', () => {
            provider._discoverRouteOperations = sinon.stub()
                .rejects(new Error('default-error'));

            return provider.updateRoutes()
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'default-error');
                });
        });
    });

    describe('_filterRouteTables', () => {
        const routeTables = [
            {
                name: 'rt01',
                tags: { F5_LABEL: 'foo', ENV: 'dev' },
                RouteTableId: 'rtb-001'
            },
            {
                name: 'rt02',
                tags: { F5_LABEL: 'bar', ENV: 'prod' },
                RouteTableId: 'rtb-002'
            },
            {
                name: 'rt03',
                Tags: [{ Key: 'F5_LABEL', Value: 'foo' }],
                RouteTableId: 'rtb-003'
            }
        ];

        it('should filter by matching tags', () => {
            const result = provider._filterRouteTables(routeTables, { tags: { F5_LABEL: 'foo' } });
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'rt01');
        });

        it('should filter by multiple tags requiring all to match', () => {
            const result = provider._filterRouteTables(routeTables, {
                tags: { F5_LABEL: 'foo', ENV: 'dev' }
            });
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'rt01');
        });

        it('should return empty when no tags match', () => {
            const result = provider._filterRouteTables(routeTables, { tags: { F5_LABEL: 'nonexistent' } });
            assert.strictEqual(result.length, 0);
        });

        it('should filter by name', () => {
            const result = provider._filterRouteTables(routeTables, { name: 'rt02' });
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'rt02');
        });

        it('should filter by RouteTableId when item has no name property', () => {
            const rts = [{ RouteTableId: 'rtb-002', tags: {} }];
            const result = provider._filterRouteTables(rts, { name: 'rtb-002' });
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].RouteTableId, 'rtb-002');
        });

        it('should return empty when no options provided', () => {
            const result = provider._filterRouteTables(routeTables);
            assert.deepStrictEqual(result, []);
        });

        it('should return empty when options is empty object', () => {
            const result = provider._filterRouteTables(routeTables, {});
            assert.deepStrictEqual(result, []);
        });

        it('should return empty when tags is an empty object', () => {
            // Empty tags means no tag filters are specified, so the tags branch
            // is skipped (guard checks Object.keys(options.tags).length). With no
            // name provided either, no route tables match.
            const result = provider._filterRouteTables(routeTables, { tags: {} });
            assert.deepStrictEqual(result, []);
        });

        it('should handle route tables with parsedTags', () => {
            const rts = [{ name: 'rt-parsed', parsedTags: { F5_LABEL: 'foo' } }];
            const result = provider._filterRouteTables(rts, { tags: { F5_LABEL: 'foo' } });
            assert.strictEqual(result.length, 1);
        });

        it('should handle route tables with no tags at all', () => {
            const rts = [{ name: 'rt-no-tags' }];
            const result = provider._filterRouteTables(rts, { tags: { F5_LABEL: 'foo' } });
            assert.strictEqual(result.length, 0);
        });
    });

    describe('_matchRouteToAddressRange', () => {
        it('should match when routeAddresses contains "all"', () => {
            const ranges = [{ routeAddresses: ['all'], routeNextHopAddresses: {} }];
            const result = provider._matchRouteToAddressRange('192.0.0.0/24', ranges);
            assert.deepStrictEqual(result, ranges[0]);
        });

        it('should match specific CIDR', () => {
            const ranges = [
                { routeAddresses: ['10.0.0.0/8'], routeNextHopAddresses: {} },
                { routeAddresses: ['192.0.0.0/24'], routeNextHopAddresses: {} }
            ];
            const result = provider._matchRouteToAddressRange('192.0.0.0/24', ranges);
            assert.deepStrictEqual(result, ranges[1]);
        });

        it('should return null when no match', () => {
            const ranges = [{ routeAddresses: ['10.0.0.0/8'], routeNextHopAddresses: {} }];
            const result = provider._matchRouteToAddressRange('192.0.0.0/24', ranges);
            assert.strictEqual(result, null);
        });
    });

    describe('_normalizeTags', () => {
        it('should pass through object tags', () => {
            const result = provider._normalizeTags({ key1: 'value1', key2: 'value2' });
            assert.strictEqual(result.key1, 'value1');
            assert.strictEqual(result.key2, 'value2');
        });

        it('should convert AWS-style array tags to object', () => {
            const result = provider._normalizeTags([
                { Key: 'key1', Value: 'value1' },
                { Key: 'key2', Value: 'value2' }
            ]);
            assert.strictEqual(result.key1, 'value1');
            assert.strictEqual(result.key2, 'value2');
        });

        it('should trim whitespace from keys and values', () => {
            const result = provider._normalizeTags({ '  key1  ': '  value1  ' });
            assert.strictEqual(result.key1, 'value1');
        });

        it('should handle empty tags object', () => {
            const result = provider._normalizeTags({});
            assert.deepStrictEqual(result, {});
        });

        it('should handle empty tags array', () => {
            const result = provider._normalizeTags([]);
            assert.deepStrictEqual(result, {});
        });
    });

    describe('_retrier', () => {
        it('should call utils.retrier with defaults', () => {
            const func = sinon.stub().resolves('result');

            return provider._retrier(func, ['arg1'])
                .then((result) => {
                    assert.strictEqual(result, 'result');
                });
        });

        it('should use provided options for maxRetries and retryInterval', () => {
            const func = sinon.stub().resolves('ok');

            return provider._retrier(func, [], {
                maxRetries: 1,
                retryInterval: 10,
                thisArg: provider,
                logger: provider.logger
            })
                .then((result) => {
                    assert.strictEqual(result, 'ok');
                });
        });

        it('should reject when function fails after retries', () => {
            provider.maxRetries = 0;
            provider.retryInterval = 10;
            const func = sinon.stub().rejects(new Error('retrier-fail'));

            return provider._retrier(func, [])
                .then(() => {
                    assert.fail('Should have rejected');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, 'retrier-fail');
                });
        });
    });

    describe('_generateAddressOperations', () => {
        it('should log error when parsedNics.mine is missing', () => provider._generateAddressOperations(['1.1.1.1'], ['2.2.2.2'], {})
            .then((ops) => {
                assert.ok(provider.logger.error.calledWith('Could not determine network interfaces.'));
                assert.deepStrictEqual(ops.disassociate, []);
                assert.deepStrictEqual(ops.associate, []);
            }));

        it('should log error when parsedNics.theirs is missing', () => provider._generateAddressOperations(
            ['1.1.1.1'],
            ['2.2.2.2'],
            { mine: [{ nic: {} }] }
        )
            .then((ops) => {
                assert.ok(provider.logger.error.calledWith('Could not determine network interfaces.'));
                assert.deepStrictEqual(ops.disassociate, []);
            }));

        it('should return empty operations when mine and theirs are empty arrays', () => provider._generateAddressOperations(
            ['1.1.1.1'],
            ['2.2.2.2'],
            { mine: [], theirs: [] }
        )
            .then((ops) => {
                assert.deepStrictEqual(ops.disassociate, []);
                assert.deepStrictEqual(ops.associate, []);
            }));

        it('should warn when NIC_TAG is undefined on either NIC', () => {
            const parsedNics = {
                mine: [{ nic: { tags: {} } }],
                theirs: [{ nic: { tags: {} } }]
            };

            return provider._generateAddressOperations(['1.1.1.1'], ['2.2.2.2'], parsedNics)
                .then(() => {
                    assert.ok(provider.logger.warning.calledWith(sinon.match('tag values do not match')));
                });
        });

        it('should generate disassociate/associate when NIC tags match and operations exist', () => {
            const constants = require('../../../src/nodejs/constants');
            const theirNicTags = {};
            theirNicTags[constants.NIC_TAG] = 'external';
            const myNicTags = {};
            myNicTags[constants.NIC_TAG] = 'external';

            const parsedNics = {
                mine: [{ nic: { tags: myNicTags } }],
                theirs: [{ nic: { tags: theirNicTags } }]
            };

            provider._checkForNicOperations = sinon.stub().returns({
                disassociate: ['disassoc-op'],
                associate: ['assoc-op']
            });

            return provider._generateAddressOperations(['1.1.1.1'], ['2.2.2.2'], parsedNics)
                .then((ops) => {
                    assert.strictEqual(ops.disassociate.length, 1);
                    assert.strictEqual(ops.associate.length, 1);
                });
        });

        it('should not generate operations when _checkForNicOperations returns empty', () => {
            const constants = require('../../../src/nodejs/constants');
            const tags = {};
            tags[constants.NIC_TAG] = 'external';

            const parsedNics = {
                mine: [{ nic: { tags: Object.assign({}, tags) } }],
                theirs: [{ nic: { tags: Object.assign({}, tags) } }]
            };

            provider._checkForNicOperations = sinon.stub().returns({});

            return provider._generateAddressOperations(['1.1.1.1'], ['2.2.2.2'], parsedNics)
                .then((ops) => {
                    assert.strictEqual(ops.disassociate.length, 0);
                    assert.strictEqual(ops.associate.length, 0);
                });
        });

        it('should normalize TagSet when tags property is missing', () => {
            const constants = require('../../../src/nodejs/constants');
            const parsedNics = {
                mine: [{
                    nic: {
                        TagSet: [
                            { Key: constants.NIC_TAG, Value: 'external' }
                        ]
                    }
                }],
                theirs: [{
                    nic: {
                        TagSet: [
                            { Key: constants.NIC_TAG, Value: 'external' }
                        ]
                    }
                }]
            };

            provider._checkForNicOperations = sinon.stub().returns({
                disassociate: ['d'],
                associate: ['a']
            });

            return provider._generateAddressOperations(['1.1.1.1'], ['2.2.2.2'], parsedNics)
                .then((ops) => {
                    assert.strictEqual(ops.disassociate.length, 1);
                    assert.strictEqual(ops.associate.length, 1);
                });
        });

        it('should skip when NIC tags exist but do not match', () => {
            const constants = require('../../../src/nodejs/constants');
            const myTags = {};
            myTags[constants.NIC_TAG] = 'external';
            const theirTags = {};
            theirTags[constants.NIC_TAG] = 'internal';

            const parsedNics = {
                mine: [{ nic: { tags: myTags } }],
                theirs: [{ nic: { tags: theirTags } }]
            };

            provider._checkForNicOperations = sinon.stub();

            return provider._generateAddressOperations(['1.1.1.1'], ['2.2.2.2'], parsedNics)
                .then((ops) => {
                    assert.strictEqual(provider._checkForNicOperations.callCount, 0);
                    assert.deepStrictEqual(ops.disassociate, []);
                    assert.deepStrictEqual(ops.associate, []);
                });
        });
    });
});
