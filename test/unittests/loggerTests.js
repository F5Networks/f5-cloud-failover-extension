/**
 * Copyright 2019 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const assert = require('assert');
const logger = require('../../src/nodejs/logger');
const LOG_LEVELS = require('../constants.js').LOG_LEVELS;

const loggedMessages = {
    warning: [],
    info: [],
    finest: [],
    finer: [],
    fine: [],
    severe: []
};

const loggerMock = {
    finest(message) { loggedMessages.finest.push(message); },
    finer(message) { loggedMessages.finer.push(message); },
    fine(message) { loggedMessages.fine.push(message); },
    warning(message) { loggedMessages.warning.push(message); },
    info(message) { loggedMessages.info.push(message); },
    severe(message) { loggedMessages.severe.push(message); }
};

describe('logger', () => {
    beforeEach(() => {
        logger.logger = loggerMock;
        Object.keys(loggedMessages).forEach((level) => {
            loggedMessages[level].length = 0;
        });
    });

    it('should log at the appropriate level', () => {
        Object.keys(LOG_LEVELS).forEach((level) => {
            logger[level](`this is a ${level} message`);
        });

        // only warnings, errors and info level logs logged by default
        assert.strictEqual(loggedMessages.warning.length, 1);
        assert.strictEqual(loggedMessages.severe.length, 1);
        // info does not have a mapping
        assert.strictEqual(loggedMessages.info.length, 1);
        assert.notStrictEqual(loggedMessages.info[0].indexOf('this is a info message'), -1);
    });

    it('should log extra args', () => {
        logger.info('part 1', 'part 2', 'part 3');
        assert.notStrictEqual(loggedMessages.info[0].indexOf('part 1 part 2 part 3'), -1);
    });

    it('should set the message if not JSON object', () => {
        logger.info('some string');
        assert.notStrictEqual(loggedMessages.info[0].indexOf('some string'), -1);
    });

    it('validate log method when object is a second parameter', () => {
        const myObj = { key01: 'test_value' };
        logger.info('info message', myObj);
        assert.notStrictEqual(loggedMessages.info[0].indexOf('test_value'), -1);
    });

    it('should mask passwords', () => {
        const myPassword = 'foofoo';
        logger.info({ password: myPassword });
        assert.strictEqual(loggedMessages.info[0].indexOf(myPassword), -1);
        assert.notStrictEqual(loggedMessages.info[0].indexOf('password:', -1));
        assert.notStrictEqual(loggedMessages.info[0].indexOf('********', -1));
    });

    it('should log at the set log level name', () => {
        logger.setLogLevel('silly');
        logger.silly('This is a silly log');
        assert.strictEqual(loggedMessages.finest.length, 1);
        assert.notStrictEqual(loggedMessages.finest[0].indexOf('This is a silly log'), -1);
    });

    it('should log at the set log level number', () => {
        logger.setLogLevel(LOG_LEVELS.verbose);
        logger.verbose('This is a finer log');
        logger.silly('This log shouldn\'t be included');
        logger.info('This should be');
        logger.debug('This should be');
        logger.error('This should be');
        logger.warning('This should be');
        assert.strictEqual(loggedMessages.info.length, 2);
        assert.strictEqual(loggedMessages.severe.length, 1);
        assert.strictEqual(loggedMessages.warning.length, 1);
        assert.strictEqual(loggedMessages.finest.length, 0);
        assert.strictEqual(loggedMessages.finer.length, 1);
        assert.strictEqual(loggedMessages.fine.length, 1);
        assert.notStrictEqual(loggedMessages.finer[0].indexOf('This is a finer log'), -1);
    });

    it('should only log levels higher that info', () => {
        logger.setLogLevel(LOG_LEVELS.info);
        logger.verbose('This log shouldn\'t be included');
        logger.silly('This log shouldn\'t be included');
        logger.debug('This log shouldn\'t be included');
        logger.info('This should be');
        logger.error('This should be');
        logger.warning('This should be');
        assert.strictEqual(loggedMessages.info.length, 2);
        assert.strictEqual(loggedMessages.severe.length, 1);
        assert.strictEqual(loggedMessages.warning.length, 1);
        assert.strictEqual(loggedMessages.finest.length, 0);
        assert.strictEqual(loggedMessages.finer.length, 0);
        assert.strictEqual(loggedMessages.fine.length, 0);
        assert.notStrictEqual(loggedMessages.info[1].indexOf('This should be'), -1);
    });

    it('should default to info level when invalid log level name is provided', () => {
        logger.setLogLevel('blah');
        logger.verbose('This log shouldn\'t be included');
        logger.silly('This log shouldn\'t be included');
        logger.debug('This log shouldn\'t be included');
        logger.info('This should be');
        logger.error('This should be');
        logger.warning('This should be');
        assert.strictEqual(loggedMessages.info.length, 1);
        assert.strictEqual(loggedMessages.severe.length, 2);
        assert.strictEqual(loggedMessages.warning.length, 1);
        assert.strictEqual(loggedMessages.finest.length, 0);
        assert.strictEqual(loggedMessages.finer.length, 0);
        assert.strictEqual(loggedMessages.fine.length, 0);
        assert.notStrictEqual(loggedMessages.info[0].indexOf('This should be'), -1);
        assert.notStrictEqual(loggedMessages.severe[0].indexOf('Unknown logLevel - blah'), -1);
    });

    it('should default to info level when invalid log level number is provided', () => {
        logger.setLogLevel(100);
        logger.verbose('This log shouldn\'t be included');
        logger.silly('This log shouldn\'t be included');
        logger.info('This should be');
        assert.strictEqual(loggedMessages.info.length, 1);
        assert.strictEqual(loggedMessages.finest.length, 0);
        assert.strictEqual(loggedMessages.fine.length, 0);
        assert.notStrictEqual(loggedMessages.info[0].indexOf('Global logLevel set to \'info\''), -1);
    });
});
