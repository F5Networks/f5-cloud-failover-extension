/**
 * Copyright 2021 F5 Networks, Inc.
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
        assert.notStrictEqual(loggedMessages.info[0].indexOf('"password":'), -1);
        assert.notStrictEqual(loggedMessages.info[0].indexOf('"********"'), -1);
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

    it('should mask passphrase in objects', () => {
        logger.setLogLevel(LOG_LEVELS.info);
        const myPassphrase = 'secret123';
        logger.info({ passphrase: myPassphrase });
        const lastMsg = loggedMessages.info[loggedMessages.info.length - 1];
        assert.strictEqual(lastMsg.indexOf(myPassphrase), -1);
        assert.notStrictEqual(lastMsg.indexOf('"passphrase":'), -1);
        assert.notStrictEqual(lastMsg.indexOf('"********"'), -1);
    });

    it('should mask Password in objects (case insensitive)', () => {
        logger.setLogLevel(LOG_LEVELS.info);
        const myPassword = 'mypassword123';
        logger.info({ Password: myPassword });
        const lastMsg = loggedMessages.info[loggedMessages.info.length - 1];
        assert.strictEqual(lastMsg.indexOf(myPassword), -1);
        assert.notStrictEqual(lastMsg.indexOf('"Password":'), -1);
        assert.notStrictEqual(lastMsg.indexOf('"********"'), -1);
    });

    it('should handle non-object messages in mask function', () => {
        logger.setLogLevel(LOG_LEVELS.info);
        logger.info('simple string message');
        const lastMsg = loggedMessages.info[loggedMessages.info.length - 1];
        assert.notStrictEqual(lastMsg.indexOf('simple string message'), -1);
    });

    it('should handle object with multiple keys where one needs masking', () => {
        logger.setLogLevel(LOG_LEVELS.info);
        const obj = { username: 'admin', password: 'secret', host: 'example.com' };
        logger.info(obj);
        const lastMsg = loggedMessages.info[loggedMessages.info.length - 1];
        assert.strictEqual(lastMsg.indexOf('secret'), -1);
        assert.notStrictEqual(lastMsg.indexOf('admin'), -1);
        assert.notStrictEqual(lastMsg.indexOf('example.com'), -1);
        assert.notStrictEqual(lastMsg.indexOf('"********"'), -1);
    });

    it('should log object as second parameter and mask sensitive data', () => {
        logger.setLogLevel(LOG_LEVELS.info);
        const sensitiveObj = { passPhrase: 'secret-passphrase', data: 'public' };
        logger.info('API call result:', sensitiveObj);
        const lastMsg = loggedMessages.info[loggedMessages.info.length - 1];
        assert.strictEqual(lastMsg.indexOf('secret-passphrase'), -1);
        assert.notStrictEqual(lastMsg.indexOf('public'), -1);
        assert.notStrictEqual(lastMsg.indexOf('"********"'), -1);
    });

    it('should handle invalid string log level and log error', () => {
        const initialCount = loggedMessages.severe.length;
        logger.setLogLevel('invalid');
        // Should log error about unknown log level
        assert.strictEqual(loggedMessages.severe.length, initialCount + 1);
        assert.notStrictEqual(loggedMessages.severe[loggedMessages.severe.length - 1].indexOf('Unknown logLevel - invalid'), -1);
    });

    it('should stringify objects in log messages', () => {
        const testObj = { key1: 'value1', key2: 'value2' };
        logger.info(testObj);
        assert.notStrictEqual(loggedMessages.info[0].indexOf('key1'), -1);
        assert.notStrictEqual(loggedMessages.info[0].indexOf('value1'), -1);
    });

    it('should suppress warning logs when log level is set to error', () => {
        logger.setLogLevel(LOG_LEVELS.error);
        // clear any messages produced by setLogLevel before asserting on the filtering
        Object.keys(loggedMessages).forEach((level) => {
            loggedMessages[level].length = 0;
        });
        logger.warning('This warning should be suppressed');
        logger.info('This info should be suppressed');
        logger.error('This error should be logged');
        // warning(4) and info(3) are below error(5), so they are filtered out
        assert.strictEqual(loggedMessages.warning.length, 0);
        assert.strictEqual(loggedMessages.info.length, 0);
        assert.strictEqual(loggedMessages.severe.length, 1);
        // restore default level for subsequent tests
        logger.setLogLevel(LOG_LEVELS.info);
    });

    it('should treat a non-string, non-number log level as unknown', () => {
        const initialCount = loggedMessages.severe.length;
        // object is neither string nor number, so level stays undefined
        logger.setLogLevel({ level: 'info' });
        assert.strictEqual(loggedMessages.severe.length, initialCount + 1);
        assert.notStrictEqual(
            loggedMessages.severe[loggedMessages.severe.length - 1].indexOf('Unknown logLevel - [object Object]'),
            -1
        );
        // restore default level for subsequent tests
        logger.setLogLevel(LOG_LEVELS.info);
    });

    it('should treat a null log level as unknown', () => {
        const initialCount = loggedMessages.severe.length;
        // null is neither string nor number, so level stays undefined
        logger.setLogLevel(null);
        assert.strictEqual(loggedMessages.severe.length, initialCount + 1);
        assert.notStrictEqual(
            loggedMessages.severe[loggedMessages.severe.length - 1].indexOf('Unknown logLevel - null'),
            -1
        );
        logger.setLogLevel(LOG_LEVELS.info);
    });

    it('should return the same cached instance on repeated require', () => {
        /* eslint-disable global-require */
        const LoggerModule = require('../../src/nodejs/logger');
        const secondReference = require('../../src/nodejs/logger');
        // repeated requires of the same resolved path return the identical cached export
        assert.strictEqual(LoggerModule, secondReference);
    });

    it('should use the built-in mock logger when f5-logger is not available', () => {
        const loggerPath = require.resolve('../../src/nodejs/logger');
        // Capture the original cached module so it can be restored exactly. Re-requiring
        // after a cache delete would create a divergent singleton (logger.js exports
        // new LoggerInstance().getInstance()), which would break other test files that
        // hold a reference to the original singleton.
        const originalCacheEntry = require.cache[loggerPath];
        // load a fresh logger without overriding its internal logger, so the
        // built-in mock (empty no-op level methods) is exercised
        delete require.cache[loggerPath];
        const freshLogger = require('../../src/nodejs/logger');
        try {
            // The built-in mock defines info() and warning() with names matching the
            // f5-logger level names used by log(), so those route through cleanly.
            freshLogger.setLogLevel(LOG_LEVELS.info);
            assert.doesNotThrow(() => {
                freshLogger.info('info message via built-in mock');
                freshLogger.warning('warning message via built-in mock');
            });
        } finally {
            // restore the original singleton instance for other test files
            require.cache[loggerPath] = originalCacheEntry;
        }
    });
});

describe('logger with f5-logger present', () => {
    const Module = require('module');
    const loggerPath = require.resolve('../../src/nodejs/logger');

    let originalRequire;
    let originalCacheEntry;
    let getInstanceCalls;
    let f5LoggerMock;
    let f5Logger;

    beforeEach(() => {
        // Capture the original cached singleton so it can be restored exactly in
        // afterEach. Re-requiring after a cache delete would create a divergent
        // singleton instance and break other test files holding the original.
        originalCacheEntry = require.cache[loggerPath];
        getInstanceCalls = [];
        f5LoggerMock = {
            finest() {},
            finer() {},
            fine() {},
            info() {},
            warning() {},
            severe() {}
        };
        // fake f5-logger module that records the options passed to getInstance
        const fakeF5Logger = {
            getInstance(options) {
                getInstanceCalls.push(options);
                return f5LoggerMock;
            }
        };

        // intercept require('f5-logger') so logger.js resolves a truthy f5Logger
        originalRequire = Module.prototype.require;
        Module.prototype.require = function patchedRequire(request) {
            if (request === 'f5-logger') {
                return fakeF5Logger;
            }
            return originalRequire.apply(this, arguments);
        };

        // load a fresh copy of logger.js so its top-level require('f5-logger') succeeds
        delete require.cache[loggerPath];
        f5Logger = require('../../src/nodejs/logger');
    });

    afterEach(() => {
        // restore require and the original singleton instance for other test files
        Module.prototype.require = originalRequire;
        require.cache[loggerPath] = originalCacheEntry;
    });

    it('should initialize f5-logger with mapped log level options on construction', () => {
        // constructor runs _initializeLogger with f5Logger present (default info level)
        assert.strictEqual(getInstanceCalls.length, 1);
        const options = getInstanceCalls[0];
        assert.strictEqual(options.logLevel, 'info');
        assert.strictEqual(options.fileLogLevel, 'info');
        assert.strictEqual(options.fileLogPath, '/var/log/restnoded/restnoded.log');
    });

    it('should reinitialize f5-logger when the log level changes', () => {
        f5Logger.setLogLevel(LOG_LEVELS.debug);
        // a second getInstance call indicates the logger was recreated for the new level
        assert.strictEqual(getInstanceCalls.length, 2);
        const options = getInstanceCalls[getInstanceCalls.length - 1];
        assert.strictEqual(options.logLevel, 'fine');
        assert.strictEqual(options.fileLogLevel, 'fine');
    });

    it('should map each log level to the corresponding f5-logger level', () => {
        const expected = {
            [LOG_LEVELS.silly]: 'finest',
            [LOG_LEVELS.verbose]: 'finer',
            [LOG_LEVELS.debug]: 'fine',
            [LOG_LEVELS.info]: 'info',
            [LOG_LEVELS.warning]: 'warning',
            [LOG_LEVELS.error]: 'severe'
        };
        Object.keys(expected).forEach((level) => {
            f5Logger.setLogLevel(Number(level));
            const options = getInstanceCalls[getInstanceCalls.length - 1];
            assert.strictEqual(options.logLevel, expected[level]);
            assert.strictEqual(options.fileLogLevel, expected[level]);
        });
    });

    it('should route log output through the f5-logger instance', () => {
        const severeMessages = [];
        f5LoggerMock.severe = (message) => { severeMessages.push(message); };
        f5Logger.setLogLevel(LOG_LEVELS.info);
        f5Logger.error('an error via f5-logger');
        assert.strictEqual(severeMessages.length, 1);
        assert.notStrictEqual(severeMessages[0].indexOf('an error via f5-logger'), -1);
    });

    it('should fall back to the info f5-logger level when the level has no mapping', () => {
        // an out-of-range numeric level passes setLogLevel validation but is absent
        // from levelMap, so _initializeLogger falls back to the info mapping
        f5Logger.setLogLevel(100);
        const options = getInstanceCalls[getInstanceCalls.length - 1];
        assert.strictEqual(options.logLevel, 'info');
        assert.strictEqual(options.fileLogLevel, 'info');
    });
});
