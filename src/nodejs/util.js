/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const cloudLibsUtil = require('@f5devcentral/f5-cloud-libs').util;

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
     */
    restOperationResponder(restOperation, status, body) {
        restOperation.setStatusCode(status);
        restOperation.setBody(body);
        restOperation.complete();
    },

    /**
    * Retrier function, that wraps tryUntil() from f5-cloud-libs in a native Promise
    *
    * @param {Object}   func - Function to try
    * @param {Object}   args - Arguments to pass to function
    * @param {Object}   [retryOptions]                 - Options for retrying the request.
    * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
    *                                                   0 to not retry. Default 90.
    * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
    *
    * @returns {Promise}
    */
    retrier(func, args, retryOptions) {
        const retry = retryOptions || cloudLibsUtil.DEFAULT_RETRY;

        // set continueOnError to true, always
        retry.continueOnError = true;

        return new Promise((resolve, reject) => {
            cloudLibsUtil.tryUntil(this, retry, func, args)
                .then((data) => {
                    resolve(data);
                })
                .catch((error) => {
                    reject(error);
                });
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
                ret = null;
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
