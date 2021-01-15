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

const hooks = require('hooks');

/**
 * Skip '/trigger' endpoint testing using Dredd, it would require
 * implementing workflows better suited for mocha functional tests
 */
hooks.beforeEach((transaction, done) => {
    if (transaction.request.uri.includes('/trigger')) {
        transaction.skip = true;
    }
    done();
});
