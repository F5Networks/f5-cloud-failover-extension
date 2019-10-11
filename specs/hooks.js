/**
 * Copyright 2018 F5 Networks, Inc.
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
 * To avoid testing workflows using Dredd we currently skip /trigger get endpoint testing since
 * inorder to test the workflows we would have to mock most of the initial server configurations which defeats the purpose
 * of testing with dredd.
 */
hooks.before('/trigger > Running failover task state > 202 > application/json', (transaction, done) => {
    transaction.skip = true;
    done();
});

hooks.after('/trigger > Running failover task state > 200 > application/json; charset=UTF-8', (transaction, done) => {
    transaction.skip = true;
    done();
});

hooks.after('/trigger > Running failover task state > 400 > application/json; charset=UTF-8', (transaction, done) => {
    transaction.skip = true;
    done();
});
