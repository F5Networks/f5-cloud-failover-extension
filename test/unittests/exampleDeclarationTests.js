/*
 * Copyright 2019. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const Ajv = require('ajv');

const baseSchema = require('../../src/nodejs/schema/base_schema.json');

const ajv = new Ajv(
    {
        allErrors: true,
        useDefaults: true,
        coerceTypes: true,
        extendRefs: 'fail'
    }
);
const validate = ajv
    .compile(baseSchema);

describe('Declarations', () => {
    const baseDir = `${__dirname}/../../examples/declarations`;
    const files = fs.readdirSync(baseDir);

    files.forEach((file) => {
        it(`should validate example: ${file}`, () => {
            const data = JSON.parse(fs.readFileSync(`${baseDir}/${file}`));
            assert.ok(validate(data), getErrorString());
        });
    });
});

function getErrorString() {
    return JSON.stringify(validate.errors, null, 4);
}
