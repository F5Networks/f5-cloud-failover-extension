'use strict';

const fs = require('fs');
const path = require('path');

const packageLockPath = path.join(__dirname, '../package-lock.json');

function removeResolved(obj) {
    if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach((key) => {
            if (key === 'resolved') {
                delete obj[key];
            } else if (typeof obj[key] === 'object') {
                removeResolved(obj[key]);
            }
        });
    }
}

try {
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

    removeResolved(packageLock);

    fs.writeFileSync(packageLockPath, JSON.stringify(packageLock, null, 2), 'utf8');
} catch (error) {
    // console.error('Error processing package-lock.json:', error);
}
