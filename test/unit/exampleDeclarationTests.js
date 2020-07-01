/*
 * Copyright 2020. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

const fs = require('fs');

const Validator = require('../../src/nodejs/validator.js');

const validator = new Validator();

describe('Declarations', () => {
    const baseDir = `${__dirname}/../../examples/declarations`;
    const files = fs.readdirSync(baseDir);

    files.forEach((file) => {
        it(`should validate example: ${file}`, () => {
            const data = JSON.parse(fs.readFileSync(`${baseDir}/${file}`));
            const validation = validator.validate(data);
            if (!validation.isValid) {
                const error = new Error(`Invalid declaration: ${JSON.stringify(validation.errors)}`);
                return Promise.reject(error);
            }
            return Promise.resolve();
        });
    });
});
