/*
 * Copyright 2021. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const axios = require('axios').default;
const https = require('https');
const FormData = require('form-data');
const Logger = require('./logger.js');

const MAX_RETRIES = require('./constants').MAX_RETRIES;
const RETRY_INTERVAL = require('./constants').RETRY_INTERVAL;

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
     * LX rest operation responder
     *
     * @param {Object} restOperation  - restOperation to complete
     * @param {String} status         - HTTP status code
     * @param {String} body           - HTTP body
     *
     * @returns {Promise} A promise which will be resolved once function resolves
     */
    restOperationResponder(restOperation, status, body) {
        restOperation.setStatusCode(status);
        restOperation.setBody(body);
        restOperation.complete();
        return Promise.resolve({ status, body });
    },

    /**
     * Retrier function
     *
     * @param {Object}  func                    - Function to try
     * @param {Array}   args                    - Arguments to pass to function
     * @param {Object}  [options]               - Function options
     * @param {Integer} [options.maxRetries]    - Number of times to retry on failure
     * @param {Integer} [options.retryInterval] - Milliseconds between retries
     * @param {Object}  [options.thisArg]       - 'this' arg to use
     * @param {Object}  [options.logger]        - logger to use
     *
     * @returns {Promise} A promise which will be resolved once function resolves
     */
    retrier(func, args, options) {
        options = options || {};

        // max retries mutates during recursion, be careful!
        const maxRetries = options.maxRetries !== undefined ? options.maxRetries : MAX_RETRIES;

        const retryInterval = options.retryInterval || RETRY_INTERVAL;
        const thisArg = options.thisArg || this;
        const logger = options.logger || Logger;

        if (maxRetries === undefined || maxRetries < 0) {
            return Promise.reject(options.error || new Error('Retrier timed out with no error provided'));
        }
        return func.apply(thisArg, args)
            .catch((error) => {
                logger.silly(`Status: ${error.message} Retries left: ${maxRetries}`);

                return new Promise((resolve) => setTimeout(resolve, retryInterval))
                    .then(() => this.retrier(func, args, {
                        maxRetries: maxRetries - 1,
                        retryInterval,
                        thisArg,
                        logger,
                        error
                    }));
            });
    },

    /**
    * Sends HTTP request
    *
    * @param {String}  host                      - HTTP host
    * @param {String}  uri                       - HTTP uri
    * @param {Object}  options                   - function options
    * @param {String}  [options.method]          - HTTP method
    * @param {String}  [options.protocol]        - HTTP protocol
    * @param {Integer} [options.port]            - HTTP port
    * @param {Object}  [options.queryParams]     - HTTP query parameters
    * @param {String}  [options.body]            - HTTP body
    * @param {Object}  [options.formData]        - HTTP form data
    * @param {Object}  [options.headers]         - HTTP headers
    * @param {Object}  [options.httpsAgent]      - HTTPS Client or Proxy object
    * @param {Boolean} [options.continueOnError] - continue on error (return info even if response contains error code)
    * @param {Boolean} [options.advancedReturn]  - advanced return (return status code AND response body)
    * @param {Boolean} [options.responseType]    - expected type of the response
    * @param {Boolean} [options.validateStatus]  - validate response status codes
    *
    * @returns {Promise} Resolves a response for a request
    */
    makeRequest(host, uri, options) {
        options.protocol = options.protocol || 'https';
        options.port = options.port || 443;
        options.body = options.body || '';
        options.headers = options.headers || {};
        let formData;
        if (options.formData) {
            formData = new FormData();
            options.formData.forEach((el) => {
                formData.append(
                    el.name,
                    this.stringify(el.data),
                    {
                        filename: el.fileName || null,
                        contentType: el.contentType || null
                    }
                );
            });
            Object.assign(options.headers, formData.getHeaders());
        }

        return Promise.resolve()
            .then(() => axios.request({
                url: uri,
                baseURL: `${options.protocol}://${host}:${options.port}`,
                method: options.method || 'GET',
                auth: options.auth || null,
                withCredentials: options.auth !== null,
                headers: options.headers,
                responseType: options.responseType || 'json',
                params: options.queryParams || {},
                data: options.formData ? formData : options.body,
                httpsAgent: options.httpsAgent && options.httpsAgent.host && options.httpsAgent.host.trim() !== ''
                    ? options.httpsAgent
                    : new https.Agent({
                        rejectUnauthorized: false
                    }),
                validateStatus: options.validateStatus || false
            }))
            .then((response) => {
                // check for HTTP errors
                if (response.status > 300 && !options.continueOnError) {
                    return Promise.reject(new Error(
                        `HTTP request failed: ${response.status} ${this.stringify(response.data)}`
                    ));
                }
                // check for advanced return
                if (options.advancedReturn === true) {
                    return {
                        code: response.status,
                        body: response.data
                    };
                }
                return response.data;
            })
            .catch((err) => Promise.reject(new Error(typeof err === 'object') ? JSON.stringify(err.message) : err));
    },

    /**
     * Get data using nested key(s)
     *
     * @param {Object} data - data
     * @param {String} key  - key to use when accessing item in data
     *
     * @returns {Object} Returns data in key
     */
    getDataByKey(data, key) {
        const keys = key.split('.');
        let ret = this.deepCopy(data);
        keys.forEach((i) => {
            if (ret && typeof ret === 'object' && i in ret) {
                ret = ret[i];
            } else {
                ret = undefined;
            }
        });
        return ret;
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
     * IPv6 address validator
     *
     * @param {String} data - IPv6 address
     *
     * @returns {Boolean} Returns processed data as a boolean
     */
    validateIpv6Address(data) {
        const re = '(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))';
        return !!data.match(re);
    }
};
