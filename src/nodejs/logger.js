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

/* eslint-disable prefer-rest-params */

const MASK_REGEX = require('./constants.js').MASK_REGEX;

let f5Logger;
try {
    /* eslint-disable global-require */
    f5Logger = require('f5-logger'); // eslint-disable-line import/no-unresolved
} catch (err) {
    // f5-logger is only in place on the BIG-IPs, not on local environments. If we fail to
    // get one (in our unit tests, for instance), we will mock it in the constructor
}

const LOG_LEVELS = require('./constants.js').LOG_LEVELS;

let currentLogLevel = null;

/**
 * Logger that works with f5-cloud-libs and restnoded styles.
 *
 * @class
 */
class Logger {
    constructor() {
        this.tag = 'f5-cloud-failover';
        currentLogLevel = LOG_LEVELS.info;
        // If we weren't able to get the f5-logger, create a mock (so our unit tests run)
        this.logger = f5Logger
            ? f5Logger.getInstance()
            : {
                silly() {},
                verbose() {},
                debug() {},
                info() {},
                error() {},
                warning() {},
                severe() {}
            };
    }

    silly(message) {
        if (LOG_LEVELS.silly >= currentLogLevel) {
            log.call(this, 'finest', message, Array.prototype.slice.call(arguments, 1));
        }
    }

    verbose(message) {
        if (LOG_LEVELS.verbose >= currentLogLevel) {
            log.call(this, 'finer', message, Array.prototype.slice.call(arguments, 1));
        }
    }

    debug(message) {
        if (LOG_LEVELS.debug >= currentLogLevel) {
            log.call(this, 'fine', message, Array.prototype.slice.call(arguments, 1));
        }
    }

    info(message) {
        if (LOG_LEVELS.info >= currentLogLevel) {
            log.call(this, 'info', message, Array.prototype.slice.call(arguments, 1));
        }
    }

    error(message) {
        if (LOG_LEVELS.error >= currentLogLevel) {
            log.call(this, 'severe', message, Array.prototype.slice.call(arguments, 1));
        }
    }

    warning(message) {
        if (LOG_LEVELS.warning >= currentLogLevel) {
            log.call(this, 'warning', message, Array.prototype.slice.call(arguments, 1));
        }
    }

    setLogLevel(newLevel) {
        let level;
        let levelName;

        if (typeof newLevel === 'string') {
            levelName = newLevel.toLowerCase();
            level = getLevel(levelName);
        } else if (typeof newLevel === 'number') {
            level = newLevel;
            levelName = getLevelName(level);
        }
        if (level === undefined) {
            this.error(`Unknown logLevel - ${newLevel}`);
            return;
        }
        // allow user to see this log message to help us understand what happened with logLevel
        this.info(`Global logLevel set to '${levelName}'`);
        currentLogLevel = level;
    }
}

function log(level, message, extraArgs) {
    let fullMessage;
    let expandedArg;
    let masked;

    masked = mask(message);
    if (typeof masked === 'object') {
        fullMessage = JSON.stringify(masked);
    } else {
        fullMessage = masked;
    }

    extraArgs.forEach((extraArg) => {
        masked = mask(extraArg);
        if (typeof masked === 'object') {
            expandedArg = JSON.stringify(masked);
        } else {
            expandedArg = masked;
        }
        fullMessage = `${fullMessage} ${expandedArg}`;
    });
    this.logger[level](`[${this.tag}] ${fullMessage}`);
}

function mask(message) {
    let masked;
    if (typeof message === 'object') {
        masked = {};
        Object.assign(masked, message);
        Object.keys(masked).forEach((key) => {
            if (MASK_REGEX.test(key)) {
                masked[key] = '********';
            }
        });
    } else {
        masked = message;
    }
    return masked;
}

/**
 * Get Log Level name, by default returns name for current global logLevel
 *
 * @property {Number} [level] - log level value.
 *
 * @returns {String} log level name
 */
function getLevelName(level) {
    if (level === undefined || (level > LOG_LEVELS.error || level < LOG_LEVELS.silly)) {
        level = currentLogLevel;
    }
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    return levelName;
}

/**
 * Get Log Level  value by name, by default returns value for current global logLevel
 *
 * Note: If zero is a valid log level ensure defensive code allows for that
 *
 * @param {String} [levelName] - log level name
 *
 * @returns {Number} log level value
 */
function getLevel(levelName) {
    if (levelName === undefined || levelName === null) {
        return currentLogLevel;
    }
    return LOG_LEVELS[levelName];
}

class LoggerInstance {
    constructor() {
        if (!LoggerInstance.instance) {
            LoggerInstance.instance = new Logger();
        }
    }

    getInstance() {
        return LoggerInstance.instance;
    }
}

module.exports = new LoggerInstance().getInstance();
