'use strict';

const fs = require('fs');
const path = require('path');

// packageLockPath is a build-time constant (this script's __dirname + the fixed
// package-lock.json location); no value originates from user input, so the
// detect-non-literal-fs-filename findings on the fs.* calls below are false
// positives (CWE-22 path traversal is not reachable here).
const packageLockPath = path.join(__dirname, '../package-lock.json');

function removeResolved(obj) {
    if (Array.isArray(obj)) {
        obj.forEach((item) => removeResolved(item));
        return;
    }
    if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach((key) => {
            if (key === 'resolved') {
                // remove the field entirely regardless of its value
                // (npm-force-resolutions leaves "" or false rather than a URL)
                delete obj[key];
            } else {
                removeResolved(obj[key]);
            }
        });
    }
}

try {
    // nosemgrep: eslint.detect-non-literal-fs-filename -- packageLockPath is a build-time constant
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

    removeResolved(packageLock);

    // nosemgrep: eslint.detect-non-literal-fs-filename -- packageLockPath is a build-time constant
    fs.writeFileSync(packageLockPath, JSON.stringify(packageLock, null, 2), 'utf8');
} catch (error) {
    // surface the failure so build scripts do not silently continue with an
    // unprocessed package-lock.json
    console.error('Error processing package-lock.json:', error); // eslint-disable-line no-console
    process.exit(1);
}
