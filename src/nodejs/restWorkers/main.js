/*
  Copyright (c) 2019, F5 Networks, Inc.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at
  *
  http://www.apache.org/licenses/LICENSE-2.0
  *
  Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an
  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
  either express or implied. See the License for the specific
  language governing permissions and limitations under the License.
*/

'use strict';

const util = require('../util.js');
const Logger = require('../logger.js');
const configWorker = require('../config.js');
const FailoverClient = require('../failover.js').FailoverClient;
const constants = require('../constants.js');

const failover = new FailoverClient();
const failoverStates = constants.FAILOVER_STATES;

const logger = new Logger(module);

/**
 * @class Worker
 * @mixes RestWorker
 *
 * @description LX Extension worker called by the framework
 *
 * Called when the worker is loaded from disk and first
 * instantiated by the @LoaderWorker
 * @constructor
 */
function Worker() {
    this.state = {};
    this.WORKER_URI_PATH = 'shared/cloud-failover';
    this.isPassThrough = true;
    this.isPublic = true;
    this.isPersisted = true;
    this.isStateRequiredOnStart = true;
}

/*
 * startup events *
*/

/**
 * @description onStart is called after the worker has been loaded and mixed
 * in with Worker. You would typically implement this function if you needed
 * to verify 3rd party dependencies exist before continuing to load your worker.
 *
 * @param {Function} success - callback to indicate successful startup
 * @param {Function} error   - callback to indicate failure in startup
 */
Worker.prototype.onStart = function (success, error) {
    try {
        logger.info('Created cloud failover worker');
        success();
    } catch (err) {
        const message = `Error creating cloud failover worker: ${err}`;
        logger.severe(message);
        error(message);
    }
};

/**
 * @description onStartCompleted is called after the dependencies are available
 * and state has been loaded from storage if worker is persisted with
 * isStateRequiredOnStart set to true. Framework will mark this worker available
 * to handle requests after success callback is called.
 *
 * @param {Function} success   - callback in case of success
 * @param {Function} error     - callback in case of error
 * @param {Object} state       - previously persisted state
 * @param {Object|null} errMsg - error from loading state from storage
 */
Worker.prototype.onStartCompleted = function (success, error, state, errMsg) {
    if (errMsg) {
        this.logger.severe(`Worker onStartCompleted error: ${util.stringify(errMsg)}`);
        error();
    }

    // init config worker - makes functions from restWorker available, etc.
    configWorker.init(this)
        .then(() => {
            success();
        })
        .catch(() => {
            error();
        });
};

// LX HTTP handlers

/**
 * handle onGet HTTP request
 *
 * @param {Object} restOperation
 */
Worker.prototype.onGet = function (restOperation) {
    processRequest(restOperation);
};

/**
 *
 * handle onPost HTTP request
 * @param {Object} restOperation
 */
Worker.prototype.onPost = function (restOperation) {
    processRequest(restOperation);
};

/**
 * handle onPut HTTP request
 *
 * @param {Object} restOperation
 */
Worker.prototype.onPut = function (restOperation) {
    processRequest(restOperation);
};

/**
 * handle onPatch HTTP request
 *
 * @param {Object} restOperation
 */
Worker.prototype.onPatch = function (restOperation) {
    processRequest(restOperation);
};

/**
 * handle onDelete HTTP request
 *
 * @param {Object} restOperation
 */
Worker.prototype.onDelete = function (restOperation) {
    processRequest(restOperation);
};


/**
 * Process Requests - helper function which handles all requests to keep
 * any dependency on the native LX framework minimal
 *
 * @param {Object} restOperation  - restOperation
 */
function processRequest(restOperation) {
    const method = restOperation.method.toUpperCase();
    const pathName = restOperation.getUri().pathname.split('/')[3];
    const contentType = restOperation.getContentType().toLowerCase() || '';
    let body = restOperation.getBody();

    // validate content type, attempt to process regardless
    if (contentType !== 'application/json') {
        try {
            body = JSON.parse(body);
        } catch (err) {
            const message = 'Invalid request body. Content type should be application/json';
            logger.error(message);
            util.restOperationResponder(restOperation, 400, { message });
            return;
        }
    }

    logger.debug(`HTTP Request - ${method} /${pathName}`);

    switch (pathName) {
    case 'declare':
        switch (method) {
        case 'POST':
            configWorker.processConfigRequest(body)
                .then((config) => {
                    util.restOperationResponder(restOperation, 200, { message: 'success', declaration: config });
                })
                .catch((err) => {
                    util.restOperationResponder(restOperation, 500, { message: util.stringify(err.message) });
                });
            break;
        case 'GET':
            configWorker.getConfig()
                .then((config) => {
                    util.restOperationResponder(restOperation, 200, { message: 'success', declaration: config });
                })
                .catch((err) => {
                    util.restOperationResponder(restOperation, 500, { message: util.stringify(err.message) });
                });
            break;
        default:
            util.restOperationResponder(restOperation, 405, { message: 'Method Not Allowed' });
            break;
        }
        break;
    case 'trigger':
        // TODO: response should use an async task pattern - for now simply execute failover and respond
        switch (method) {
        case 'POST':
            failover._getTaskStateFile()
                .then((taskState) => {
                    logger.info(`taskState: ${JSON.stringify(taskState)}`);
                    if (taskState.taskState === failoverStates.RUN) {
                        return Promise.resolve();
                    }
                    return failover.execute();
                })
                .then(() => failover._getTaskStateFile())
                .then((taskState) => {
                    logger.info(`POST taskState: ${JSON.stringify(taskState)}`);
                    util.restOperationResponder(restOperation, taskState.code, taskState);
                })
                .catch((err) => {
                    util.restOperationResponder(restOperation, 500, { message: util.stringify(err.message) });
                });
            break;
        case 'GET':
            failover._getTaskStateFile()
                .then((taskState) => {
                    switch (taskState.taskState) {
                    case failoverStates.RUN:
                        taskState.code = 202;
                        break;
                    case failoverStates.PASS:
                        taskState.code = 200;
                        break;
                    default:
                        taskState.code = 400;
                        break;
                    }
                    util.restOperationResponder(restOperation, taskState.code, taskState);
                })
                .catch((err) => {
                    util.restOperationResponder(restOperation, 500, { message: util.stringify(err.message) });
                });
            break;
        default:
            util.restOperationResponder(restOperation, 405, { message: 'Method Not Allowed' });
            break;
        }
        break;
    case 'reset':
        if (method === 'POST') {
            failover.resetFailoverState(body)
                .then(() => {
                    util.restOperationResponder(restOperation, 200, { message: constants.STATE_FILE_RESET_MESSAGE });
                })
                .catch((err) => {
                    util.restOperationResponder(restOperation, 500, { message: util.stringify(err.message) });
                });
        } else {
            util.restOperationResponder(restOperation, 405, { message: 'Method Not Allowed' });
        }
        break;
    case 'info':
        util.restOperationResponder(restOperation, 200, { message: 'success' });
        break;
    default:
        util.restOperationResponder(restOperation, 400, { message: 'Invalid Endpoint' });
        break;
    }
}

module.exports = Worker;
