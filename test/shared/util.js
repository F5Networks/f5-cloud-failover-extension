/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const request = require('request');

const constants = require('../constants.js');

module.exports = {

    /**
     * Stringify a message
     *
     * @param {Object|String} msg - message to stringify
     *
     * @returns {Object} Stringified message
     */
    stringify(msg) {
        if (typeof msg === 'object') {
            try {
                msg = JSON.stringify(msg);
            } catch (e) {
                // just leave original message intact
            }
        }
        return msg;
    },

    /**
     * Deep copy
     *
     * @param {Object} obj - object to copy
     *
     * @returns {Object} deep copy of source object
     */
    deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Perform HTTP request
     *
     * @param {String}  host               - HTTP host
     * @param {String}  uri                - HTTP uri
     * @param {Object}  options            - function options
     * @param {Integer} [options.port]     - HTTP port, default is 443
     * @param {String}  [options.protocol] - HTTP protocol, default is https
     * @param {String}  [options.method]   - HTTP method, default is GET
     * @param {String}  [options.body]     - HTTP body
     * @param {Object}  [options.headers]  - HTTP headers
     *
     * @returns {Object} Returns promise resolved with response
     */
    makeRequest(host, uri, options) {
        options = options || {};
        const port = options.port === undefined ? constants.REQUEST.PORT : options.port;
        const protocol = options.protocol === undefined ? constants.REQUEST.PROTOCOL : options.protocol;

        host = host.endsWith('/') ? host.slice(0, host.length - 1) : host;
        uri = uri || '';
        uri = uri.startsWith('/') ? uri : `/${uri}`;

        options.body = typeof options.body === 'object' ? this.stringify(options.body) : options.body;

        const fullUri = `${protocol}://${host}:${port}${uri}`;
        const requestOptions = {
            uri: fullUri,
            method: options.method || 'GET',
            body: options.body || undefined,
            headers: options.headers || {},
            strictSSL: false
        };

        return new Promise((resolve, reject) => {
            request(requestOptions, (err, res, body) => {
                if (err) {
                    reject(new Error(`HTTP error for '${fullUri}' : ${err}`));
                } else if (res.statusCode >= 200 && res.statusCode <= 299) {
                    try {
                        resolve((typeof body === 'object' ? body : JSON.parse(body)));
                    } catch (e) {
                        resolve(body);
                    }
                } else {
                    const msg = `Bad status code: ${res.statusCode} ${res.statusMessage} ${res.body} for '${fullUri}'`;
                    err = new Error(msg);
                    err.statusCode = res.statusCode;
                    err.statusMessage = res.statusMessage;
                    reject(err);
                }
            });
        });
    },

    /**
     * Get auth token
     *
     * @param {String} host     - host
     * @param {String} port     - port
     * @param {String} username - username
     * @param {String} password - password
     *
     * @returns {Promise} Returns promise resolved with auth token: { token: 'token' }
     */
    getAuthToken(host, port, username, password) {
        const uri = '/mgmt/shared/authn/login';
        const body = this.stringify({
            username,
            password,
            loginProviderName: 'tmos'
        });
        const postOptions = {
            port,
            method: 'POST',
            body
        };

        return this.makeRequest(host, uri, postOptions)
            .then((data) => ({ token: data.token.token }))
            .catch((err) => {
                const msg = `getAuthToken: ${err}`;
                throw new Error(msg);
            });
    },

    /**
     * Refresh auth token
     *
     * @param {String} host  - host
     * @param {String} port  - port
     * @param {String} token - token
     *
     * @returns {Promise} Returns promise resolved with refreshed auth token: { token: 'token' }
     */
    refreshAuthToken(host, port, token) {
        const uri = `/mgmt/shared/authz/tokens/${token}`;
        const body = { timeout: 36000 };
        const patchOptions = {
            port,
            method: 'PATCH',
            headers: { 'x-f5-auth-token': token },
            body
        };

        return this.makeRequest(host, uri, patchOptions)
            .then((data) => ({ token: data.token }))
            .catch((err) => {
                const msg = `refreshAuthToken: ${err}`;
                throw new Error(msg);
            });
    },

    /**
     * Get and refresh auth token
     *
     * @param {String} host     - host
     * @param {String} port     - port
     * @param {String} username - username
     * @param {String} password - password
     *
     * @returns {Promise} Returns promise resolved with refreshed auth token: { token: 'token' }
     */
    getAndRefreshAuthToken(host, port, username, password) {
        return this.getAuthToken(host, port, username, password)
            .then((data) => this.refreshAuthToken(host, port, data.token.token))
            .then((refresh) => ({ token: refresh.token }))
            .catch((err) => {
                const msg = `getAndRefreshAuthToken: ${err}`;
                throw new Error(msg);
            });
    },

    /**
     * Refresh auth token, or get/refresh a new one if expired
     *
     * @param {String} host     - host
     * @param {String} port     - port
     * @param {String} username - username
     * @param {String} password - password
     * @param {String} token    - token
     *
     * @returns {Promise} Returns promise resolved with auth token: { token: 'token' }
     */
    refreshOrGetAuthToken(host, port, username, password, token) {
        return this.refreshAuthToken(host, port, token)
            .then((refresh) => ({ token: refresh.token }))
            .catch(() => this.getAndRefreshAuthToken(host, port, username, password));
    },

    /**
     * Revoke auth token
     *
     * @param {String} host  - host
     * @param {String} port  - port
     * @param {String} token - token
     *
     * @returns {Promise} Returns promise resolved with revoked auth token: { token: 'token' }
     */
    revokeAuthToken(host, port, token) {
        const uri = `/mgmt/shared/authz/tokens/${token}`;
        const patchOptions = {
            port,
            method: 'DELETE',
            headers: { 'x-f5-auth-token': token }
        };

        return this.makeRequest(host, uri, patchOptions)
            .then((data) => ({ token: data.token }))
            .catch((err) => {
                const msg = `refreshAuthToken: ${err}`;
                throw new Error(msg);
            });
    },

    /**
     * Base64 encoder/decoder
     *
     * @param {String} action - decode|encode
     * @param {String} data - data to process
     *
     * @returns {String} Returns processed data as a string
     */
    base64(action, data) {
        // support decode|encode actions
        if (action === 'decode') {
            return Buffer.from(data, 'base64').toString().trim();
        }
        if (action === 'encode') {
            return Buffer.from(data).toString('base64');
        }
        throw new Error('Unsupported action, try one of these: decode, encode');
    },

    /**
     * Create data group object
     *
     * @param {Object} config
     *
     * @returns {Object} Returns formatted data group object
     */
    createDataGroupObject(config) {
        return {
            name: 'f5-cloud-failover-store',
            records: [
                {
                    name: 'state',
                    data: Buffer.from(JSON.stringify({ config })).toString('base64')
                }
            ]
        };
    }
};
