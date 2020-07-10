/*
  Copyright (c) 2020, F5 Networks, Inc.
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
const logger = require('../logger.js');
const configWorker = require('../config.js');
const FailoverClient = require('../failover.js').FailoverClient;
const constants = require('../constants.js');
const Device = require('../device.js');
const TelemetryClient = require('../telemetry.js').TelemetryClient;
const schemaUtils = require('../schema/schemaUtils.js');

const telemetry = new TelemetryClient();
const device = new Device();
const failoverStates = constants.FAILOVER_STATES;

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
        logger.error(message);
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
        this.logger.error(`Worker onStartCompleted error: ${util.stringify(errMsg)}`);
        error();
    }

    configWorker.init()
        .then(() => configWorker.getConfig())
        .then((config) => {
            // set log level if it has been provided in the configuration
            if (util.getDataByKey(config, 'controls.logLevel')) {
                logger.setLogLevel(config.controls.logLevel);
            }
        })
        .then(() => device.init())
        .then(() => {
            success();
        })
        .catch((err) => {
            error(err);
        });
};

// LX HTTP handlers

/**
 * handle onGet HTTP request
 *
 * @param {Object} restOperation
 */
Worker.prototype.onGet = function (restOperation) {
    return processRequest(restOperation);
};

/**
 *
 * handle onPost HTTP request
 * @param {Object} restOperation
 */
Worker.prototype.onPost = function (restOperation) {
    return processRequest(restOperation);
};

/**
 * handle onPut HTTP request
 *
 * @param {Object} restOperation
 */
Worker.prototype.onPut = function (restOperation) {
    return processRequest(restOperation);
};

/**
 * handle onPatch HTTP request
 *
 * @param {Object} restOperation
 */
Worker.prototype.onPatch = function (restOperation) {
    return processRequest(restOperation);
};

/**
 * handle onDelete HTTP request
 *
 * @param {Object} restOperation
 */
Worker.prototype.onDelete = function (restOperation) {
    return processRequest(restOperation);
};


/**
 * Process Requests - helper function which handles all requests to keep
 * any dependency on the native LX framework minimal
 *
 * @param {Object} restOperation  - restOperation
 */
function processRequest(restOperation) {
    const startTimestamp = new Date().toJSON();
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
            return util.restOperationResponder(restOperation, 400, { message });
        }
    }

    const failover = new FailoverClient(); // failover class should be instantiated on every request

    logger.debug(`HTTP Request - ${method} /${pathName}`);
    switch (pathName) {
    case 'declare':
        switch (method) {
        case 'POST':
            // call failover init during config to ensure init succeeds prior to responding to the user
            return configWorker.processConfigRequest(body)
                .then(config => Promise.all([
                    config,
                    failover.init(),
                    telemetry.send(telemetry.createTelemetryData({
                        startTime: startTimestamp,
                        result: 'SUCCESS',
                        resultSummary: 'Configuration Successful',
                        environment: config.environment,
                        ipFailover: config.ipFailover,
                        routeFailover: config.routeFailover
                    }))
                ]))
                .then(result => util.restOperationResponder(restOperation, 200,
                    {
                        message: 'success',
                        declaration: result[0]
                    }))
                .catch(err => util.restOperationResponder(restOperation, 500,
                    {
                        message: util.stringify(err.message)
                    }));
        case 'GET':
            return configWorker.getConfig()
                .then(config => util.restOperationResponder(restOperation, 200,
                    {
                        message: 'success',
                        declaration: config
                    }))
                .catch(err => util.restOperationResponder(restOperation, 500,
                    {
                        message: util.stringify(err.message)
                    }));
        default:
            return util.restOperationResponder(restOperation, 405, { message: 'Method Not Allowed' });
        }
    case 'trigger':
        switch (method) {
        case 'POST':
            return failover.init()
                .then(() => Promise.all([
                    failover.getTaskStateFile(),
                    device.getGlobalSettings()
                ]))
                .then((result) => {
                    logger.silly(`taskState: ${util.stringify(result[0])}`);
                    if (result[0].taskState === failoverStates.RUN && result[1].hostname === result[0].instance) {
                        logger.silly('Failover is already executing');
                        return Promise.resolve();
                    }
                    return failover.execute({ callerAttributes: { endpoint: pathName, httpMethod: method } });
                })
                .then(() => failover.getTaskStateFile())
                .then(taskState => util.restOperationResponder(
                    restOperation,
                    mapStatusToCode(taskState.taskState),
                    taskState
                ))
                .catch(err => util.restOperationResponder(restOperation, 500,
                    {
                        message: util.stringify(err.message)
                    }));
        case 'GET':
            return failover.init()
                .then(() => failover.getTaskStateFile())
                .then(taskState => util.restOperationResponder(
                    restOperation,
                    mapStatusToCode(taskState.taskState),
                    taskState
                ))
                .catch(err => util.restOperationResponder(restOperation, 500,
                    {
                        message: util.stringify(err.message)
                    }));
        default:
            return util.restOperationResponder(restOperation, 405, { message: 'Method Not Allowed' });
        }
    case 'reset':
        if (method === 'POST') {
            return failover.init()
                .then(() => failover.resetFailoverState(body))
                .then(response => util.restOperationResponder(restOperation, 200, { message: response.message }))
                .catch(err => util.restOperationResponder(restOperation, 500,
                    {
                        message: util.stringify(err.message)
                    }));
        }
        return util.restOperationResponder(restOperation, 405, { message: 'Method Not Allowed' });
    case 'inspect':
        if (method === 'GET') {
            return failover.init()
                .then(() => failover.getFailoverStatusAndObjects())
                .then(statusAndObjects => util.restOperationResponder(restOperation, 200, statusAndObjects))
                .catch(err => util.restOperationResponder(restOperation, 500,
                    {
                        message: util.stringify(err.message)
                    }));
        }
        return util.restOperationResponder(restOperation, 405, { message: 'Method Not Allowed' });
    case 'info':
        return util.restOperationResponder(restOperation, 200, {
            version: constants.VERSION,
            release: constants.VERSION.split('.').reverse()[0],
            schemaCurrent: schemaUtils.getCurrentVersion(),
            schemaMinimum: schemaUtils.getMinimumVersion()
        });
    default:
        return util.restOperationResponder(restOperation, 400, { message: 'Invalid Endpoint' });
    }
}

function mapStatusToCode(taskState) {
    switch (taskState) {
    case failoverStates.RUN:
        return 202;
    case failoverStates.PASS:
        return 200;
    case failoverStates.NEVER_RUN:
        return 200;
    case failoverStates.FAIL:
        return 500;
    default:
        return 500;
    }
}

module.exports = Worker;
