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
const Ajv = require('ajv');

const ajv = new Ajv(
    {
        allErrors: true,
        useDefaults: true,
        coerceTypes: true,
        extendRefs: 'fail'
    }
);

const baseSchema = require('../../src/nodejs/schema/base_schema.json');
const initializeSchema = require('../../src/nodejs/schema/initialize_schema.json');
const failoverSchema = require('../../src/nodejs/schema/failover_schema.json');

const validate = ajv
    .addSchema(initializeSchema)
    .addSchema(failoverSchema)
    .compile(baseSchema);

/* eslint-disable quotes, quote-props */

describe('initialize_schema.json', () => {
    describe('Initialize', () => {
        describe('valid', () => {
            it('should validate initialization data', () => {
                const data = {
                    "class": "CloudFailover",
                    "MyInit": {
                        "class": "Initialize",
                        "environment": "azure",
                        "useMetadata": true,
                        "storageResource": "myuniquestorageaccount",
                        "storageTags": [
                            {
                                "key": "value",
                                "value": "myvalue"
                            }
                        ],
                        "managedRoutes": [
                            "192.168.1.0/24",
                            "0.0.0.0/0"
                        ],
                        "addressTags": [
                            {
                                "key": "value",
                                "value": "myvalue"
                            }
                        ]
                    }
                };
                assert.ok(validate(data), getErrorString(validate));
            });
        });

        describe('invalid environment', () => {
            it('should invalidate missing environment', () => {
                const data = {
                    "class": "CloudFailover",
                    "MyInit": {
                        "class": "Initialize",
                        "useMetadata": true,
                        "storageResource": "myuniquestorageaccount",
                        "storageTags": [
                            {
                                "key": "value",
                                "value": "myvalue"
                            }
                        ],
                        "managedRoutes": [
                            "192.168.1.0/24",
                            "0.0.0.0/0"
                        ],
                        "addressTags": [
                            {
                                "key": "value",
                                "value": "myvalue"
                            }
                        ]
                    }
                };
                assert.strictEqual(validate(data), false, 'missing environment should not be valid');
                assert.notStrictEqual(getErrorString().indexOf('"missingProperty": "environment"'), -1);
            });
        });

        describe('invalid metadata', () => {
            it('should invalidate missing metadata', () => {
                const data = {
                    "class": "CloudFailover",
                    "MyInit": {
                        "class": "Initialize",
                        "environment": "azure",
                        "useMetadata": false,
                        "storageResource": "myuniquestorageaccount",
                        "storageTags": [
                            {
                                "key": "value",
                                "value": "myvalue"
                            }
                        ],
                        "managedRoutes": [
                            "192.168.1.0/24",
                            "0.0.0.0/0"
                        ],
                        "addressTags": [
                            {
                                "key": "value",
                                "value": "myvalue"
                            }
                        ]
                    }
                };
                assert.strictEqual(validate(data), false, 'missing subscription should not be valid');
                assert.notStrictEqual(getErrorString().indexOf('"missingProperty": "subscription"'), -1);
            });
        });
    });
});

function getErrorString() {
    return JSON.stringify(validate.errors, null, 4);
}
