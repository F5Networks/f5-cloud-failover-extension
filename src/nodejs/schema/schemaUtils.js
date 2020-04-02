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

const BASE_SCHEMA = require('./base_schema.json');

module.exports = {
    getCurrentVersion: () => {
        const schemaVersions = BASE_SCHEMA.properties.schemaVersion.enum;
        return schemaVersions[0];
    },
    getMinimumVersion: () => {
        const schemaVersions = BASE_SCHEMA.properties.schemaVersion.enum;
        return schemaVersions[schemaVersions.length - 1];
    }
};
