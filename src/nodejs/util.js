/*
 * Copyright 2020. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

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
                logger.silly(`Function error, retrying: ${error.message} Retries left: ${maxRetries}`);

                return new Promise(resolve => setTimeout(resolve, retryInterval))
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
    }
};
