/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

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
    }
};
