/*
 * Copyright 2020. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');

/* eslint-disable global-require */

describe('Provider - Abstract', () => {
    let Provider;

    before(() => {
        Provider = require('../../../src/nodejs/providers/abstract/cloud.js').AbstractCloud;
    });
    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('should instantiate provider', () => {
        const provider = new Provider();

        // check abstract methods that should throw
        const methods = [
            'updateAddresses',
            'uploadDataToStorage',
            'downloadDataFromStorage'
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

    describe('_formatProxyUrl', () => {
        it('should format basic URL', () => {
            const provider = new Provider();

            const proxyUrl = provider._formatProxyUrl({ protocol: 'http', host: 'proxy.local', port: 3128 });
            assert.strictEqual(proxyUrl, 'http://proxy.local:3128');
        });

        it('should format HTTPS URL (by default)', () => {
            const provider = new Provider();

            const proxyUrl = provider._formatProxyUrl({ host: 'proxy.local', port: 3128 });
            assert.strictEqual(proxyUrl, 'https://proxy.local:3128');
        });

        it('should format URL with authentication info', () => {
            const provider = new Provider();

            const proxyUrl = provider._formatProxyUrl({
                protocol: 'https',
                host: 'proxy.local',
                port: 3128,
                username: 'proxyuser',
                password: 'apassword'
            });
            assert.strictEqual(proxyUrl, 'https://proxyuser:apassword@proxy.local:3128');
        });
    });
});
