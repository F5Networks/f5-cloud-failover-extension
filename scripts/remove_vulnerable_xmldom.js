'use strict';

/*
 * cruftless@1.2.1 declares an exact dependency on the unmaintained xmldom@0.6.0,
 * which carries multiple unpatched CVEs. The accompanying patch
 * (patches/cruftless+1.2.1.patch) redirects cruftless to require the maintained
 * fork @xmldom/xmldom, so xmldom@0.6.0 is never loaded at runtime. npm still
 * installs the package on disk and records it in package-lock.json though, which
 * SCA/SAST tools that scan the dependency tree or lockfile will continue to flag.
 *
 * This script removes the dead xmldom@0.6.0 package. It runs in two modes:
 *   - default (no args): remove the package from the installed node_modules tree
 *     only. This is safe to run from the postinstall hook because npm does not
 *     recreate node_modules afterward, and it does not mutate any committed file.
 *   - "--lockfile": also strip the package from package-lock.json. This must run
 *     AFTER `npm install` finishes (npm rewrites the lockfile at the end of
 *     install, overwriting any earlier edit), so it is chained from the
 *     install-production / install-all npm scripts rather than postinstall.
 *
 * Both modes are idempotent and tolerant of the package not being present.
 *
 * Security note: every filesystem path used below is derived from build-time
 * constants (__dirname + fixed node_modules / package-lock.json locations). No
 * value originates from user input or any external/runtime source, so the
 * detect-non-literal-fs-filename findings on the fs.* calls are false positives
 * (CWE-22 path traversal is not reachable here). The targeted nosemgrep
 * comments document this rather than weakening a real control.
 */

const fs = require('fs');
const path = require('path');

const packageLockPath = path.join(__dirname, '../package-lock.json');

// known locations npm may place the vulnerable transitive xmldom
const candidatePaths = [
    path.join(__dirname, '../node_modules/cruftless/node_modules/xmldom'),
    path.join(__dirname, '../node_modules/xmldom')
];

function isVulnerableXmldom(pkgDir) {
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    // nosemgrep: eslint.detect-non-literal-fs-filename -- path derived from build-time constants only
    if (!fs.existsSync(pkgJsonPath)) {
        return false;
    }
    try {
        // nosemgrep: eslint.detect-non-literal-fs-filename -- path derived from build-time constants only
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        // only remove the unscoped legacy xmldom package, never the fork
        return pkg.name === 'xmldom';
    } catch (err) {
        return false;
    }
}

function removeDir(dir) {
    // fs.rmSync is only available on Node >= 14.14; rmdirSync recursive works
    // from Node 12 onward, keeping this compatible with older runtimes.
    // nosemgrep: eslint.detect-non-literal-fs-filename -- dir is always one of the fixed candidatePaths
    fs.rmdirSync(dir, { recursive: true });
}

function removeFromDisk() {
    candidatePaths.forEach((pkgDir) => {
        // nosemgrep: eslint.detect-non-literal-fs-filename -- pkgDir is a fixed candidatePaths entry
        if (fs.existsSync(pkgDir) && isVulnerableXmldom(pkgDir)) {
            removeDir(pkgDir);
            // eslint-disable-next-line no-console
            console.log(`Removed unmaintained xmldom package from ${pkgDir}`);
        }
    });
}

// Recursively strip the unscoped "xmldom" package node and any "requires"
// declaration of it from a lockfile v1 "dependencies" tree. The scoped
// @xmldom/xmldom fork is left untouched.
function stripFromLockTree(deps) {
    if (!deps || typeof deps !== 'object') {
        return false;
    }
    let changed = false;
    Object.keys(deps).forEach((name) => {
        const node = deps[name];
        if (!node || typeof node !== 'object') {
            return;
        }
        if (node.requires && Object.prototype.hasOwnProperty.call(node.requires, 'xmldom')) {
            delete node.requires.xmldom;
            changed = true;
        }
        if (node.dependencies) {
            if (Object.prototype.hasOwnProperty.call(node.dependencies, 'xmldom')) {
                delete node.dependencies.xmldom;
                changed = true;
            }
            changed = stripFromLockTree(node.dependencies) || changed;
        }
    });
    return changed;
}

// Strip the unscoped "xmldom" entries from a lockfile v2/v3 "packages" map
// (keys look like "node_modules/cruftless/node_modules/xmldom"). The scoped
// fork lives under ".../@xmldom/xmldom" and is left untouched.
function stripFromLockPackages(packages) {
    if (!packages || typeof packages !== 'object') {
        return false;
    }
    let changed = false;
    Object.keys(packages).forEach((key) => {
        if (/(^|\/)node_modules\/xmldom$/.test(key)) {
            delete packages[key];
            changed = true;
        }
    });
    return changed;
}

function removeFromLockfile() {
    // nosemgrep: eslint.detect-non-literal-fs-filename -- packageLockPath is a build-time constant
    if (!fs.existsSync(packageLockPath)) {
        return;
    }
    // nosemgrep: eslint.detect-non-literal-fs-filename -- packageLockPath is a build-time constant
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
    let changed = false;
    if (packageLock.dependencies
        && Object.prototype.hasOwnProperty.call(packageLock.dependencies, 'xmldom')) {
        delete packageLock.dependencies.xmldom;
        changed = true;
    }
    changed = stripFromLockTree(packageLock.dependencies) || changed;
    changed = stripFromLockPackages(packageLock.packages) || changed;
    if (changed) {
        // nosemgrep: eslint.detect-non-literal-fs-filename -- packageLockPath is a build-time constant
        fs.writeFileSync(packageLockPath, JSON.stringify(packageLock, null, 2), 'utf8');
        // eslint-disable-next-line no-console
        console.log('Removed unmaintained xmldom entries from package-lock.json');
    }
}

try {
    removeFromDisk();
    if (process.argv.indexOf('--lockfile') !== -1) {
        removeFromLockfile();
    }
} catch (error) {
    // surface the failure so the build does not silently ship the vulnerable
    // xmldom@0.6.0
    console.error('Error removing vulnerable xmldom package:', error); // eslint-disable-line no-console
    process.exit(1);
}
