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
const Validator = require('../validator.js');
const Cloud = require('../providers/cloud.js');

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
// eslint-disable-next-line no-unused-vars
Worker.prototype.onStart = function (success, error) {
    try {
        this.validator = new Validator();
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
    success();
};

/*
 * http handlers *
*/

/**
 *
 * handle onGet HTTP request
 * @param {Object} restOperation
 */
Worker.prototype.onGet = function (restOperation) {
    util.restOperationResponder(restOperation, 200, { message: 'success' });
};

/**
 *
 * handle onPost HTTP request
 * @param {Object} restOperation
 */
Worker.prototype.onPost = function (restOperation) {
    // util.restOperationResponder(restOperation, 200, { message: 'success' });
    logger.finest('Got failover request.');

    const contentType = restOperation.getContentType() || '';
    let body = restOperation.getBody();

    if (contentType.toLowerCase() !== 'application/json') {
        try {
            body = JSON.parse(body);
        } catch (err) {
            const message = 'Unable to parse request body. Should be JSON format.';
            logger.info(message);
            util.restOperationResponder(restOperation, 400, { message: 'bad request format' });
            return;
        }
    }

    const declaration = Object.assign({}, body);
    const validation = this.validator.validate(declaration);

    if (!validation.isValid) {
        const message = `Bad declaration: ${JSON.stringify(validation.errors)}`;
        logger.info(message);
        util.restOperationResponder(restOperation, 400, { message: 'bad declaration' });
    } else {
        logger.fine('Successfully validated declaration');
        let initClass;
        Object.keys(declaration).forEach((key) => {
            if (declaration[key].class && declaration[key].class === 'Initialize') {
                initClass = declaration[key];
            }
        });
        logger.info(`Got declaration: ${JSON.stringify(body)}`);
        const cloudProvider = Cloud.getCloudProvider(initClass.environment, { logger });
        cloudProvider.init(initClass)
            .then(() => {
                logger.info('cloud provider has been initialized');
                return Promise.resolve();
            })
            .catch((err) => {
                logger.info('Could not initialize the cloud provider');
                logger.info(JSON.stringify(err));
            });

        util.restOperationResponder(restOperation, 200, { message: 'success' });
    }
};

/**
 *
 * handle onPut HTTP request
 * @param {Object} restOperation
 */
Worker.prototype.onPut = function (restOperation) {
    util.restOperationResponder(restOperation, 200, { message: 'success' });
};

/**
 *
 * handle onPatch HTTP request
 * @param {Object} restOperation
 */
Worker.prototype.onPatch = function (restOperation) {
    util.restOperationResponder(restOperation, 200, { message: 'success' });
};

/**
 *
 * handle onDelete HTTP request
 * @param {Object} restOperation
 */
Worker.prototype.onDelete = function (restOperation) {
    util.restOperationResponder(restOperation, 200, { message: 'success' });
};

module.exports = Worker;
