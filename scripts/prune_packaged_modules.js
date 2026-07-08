'use strict';

/*
 * Remove optional build/documentation/test tooling from node_modules before the
 * RPM is packaged.
 *
 * The RPM spec copies node_modules wholesale (`cp -r node_modules`), and on
 * npm 6 the `--no-optional` install flag does not reliably prune
 * optionalDependencies that are pinned in the committed lockfile. As a result
 * heavy doc/spec tooling (redoc, redoc-cli, dredd, mermaid.cli,
 * openapi-to-postmanv2) and their large transitive trees (dompurify, handlebars,
 * marked, sanitize-html, prismjs, elliptic, json-pointer, jsonpath, ...) end up
 * shipped in the RPM and are flagged by dependency scanners -- even though none
 * of that code is ever executed by the running extension (it is only used at
 * build time to generate API docs / postman collections and to test the spec).
 *
 * This script deletes those optional tooling package roots from node_modules so
 * they are excluded from the packaged artifact. It is invoked from
 * scripts/build_rpm.sh after `install-production` and before `rpmbuild`. It must
 * NOT be run as part of the normal dev install (those tools are needed for the
 * doc/spec build jobs).
 *
 * Only the optionalDependencies declared in package.json are removed; a guard
 * verifies none of the shipped runtime `dependencies` require them before
 * deleting, so this cannot remove anything the extension needs at runtime.
 */

const fs = require('fs');
const path = require('path');

// Security note: every filesystem path below is derived from build-time
// constants (__dirname + the package.json dependency names); no value comes from
// user input, so the detect-non-literal-fs-filename findings on the fs.* calls
// are false positives (CWE-22 path traversal is not reachable here).
const repoRoot = path.join(__dirname, '..');
// nosemgrep: eslint.detect-non-literal-fs-filename -- path is repoRoot/package.json (build-time constant)
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const nodeModules = path.join(repoRoot, 'node_modules');

const optionalRoots = Object.keys(pkg.optionalDependencies || {});
const runtimeRoots = Object.keys(pkg.dependencies || {});

// Read an installed package's manifest from node_modules. Returns null when the
// package is not present at the top level (e.g. it is nested under a dependent).
function readManifest(name) {
    try {
        // nosemgrep: eslint.detect-non-literal-fs-filename -- name is a package name from a manifest's deps
        return JSON.parse(fs.readFileSync(path.join(nodeModules, name, 'package.json'), 'utf8'));
    } catch (err) {
        return null;
    }
}

// Safety guard: make sure nothing in the *transitive* runtime dependency tree
// declares any of the optional tooling as a dependency. If it does, abort rather
// than risk removing something needed at runtime.
//
// The earlier version only inspected each direct runtime dependency's manifest,
// so a deeper transitive runtime dep that required an optional tool would slip
// through. This walks the whole runtime closure (following on-disk
// dependencies/optionalDependencies/peerDependencies of every reachable package)
// and reports the dependency chain to the offending optional root.
function runtimeRequiresOptional() {
    const optional = new Set(optionalRoots);
    const offenders = [];
    const visited = new Set();
    // queue entries carry the chain of package names walked so far
    const queue = runtimeRoots.map((rt) => [rt]);

    while (queue.length) {
        const chain = queue.shift();
        const name = chain[chain.length - 1];
        if (visited.has(name)) {
            continue; // eslint-disable-line no-continue
        }
        visited.add(name);

        const manifest = readManifest(name);
        if (!manifest) {
            continue; // eslint-disable-line no-continue
        }

        const deps = Object.assign(
            {},
            manifest.dependencies,
            manifest.optionalDependencies,
            manifest.peerDependencies
        );
        Object.keys(deps).forEach((dep) => {
            if (optional.has(dep)) {
                offenders.push(`${chain.join(' -> ')} -> ${dep}`);
            } else if (!visited.has(dep)) {
                queue.push(chain.concat(dep));
            }
        });
    }
    return offenders;
}

function removeDir(dir) {
    // fs.rmSync (Node >=14.14) replaces the deprecated fs.rmdirSync({ recursive })
    // -- the CI target is Node 14.21, and rmSync silences the deprecation warning
    // developers see on Node 16+/22. force: true ignores a missing path.
    // nosemgrep: eslint.detect-non-literal-fs-filename -- dir is nodeModules/<optionalDependency> only
    fs.rmSync(dir, { recursive: true, force: true });
}

try {
    const offenders = runtimeRequiresOptional();
    if (offenders.length) {
        // eslint-disable-next-line no-console
        console.error(`Aborting prune: runtime dependency requires optional tooling: ${offenders.join(', ')}`);
        process.exit(1);
    }

    let removed = 0;
    optionalRoots.forEach((name) => {
        const dir = path.join(nodeModules, name);
        // nosemgrep: eslint.detect-non-literal-fs-filename -- dir is nodeModules/<optionalDependency> only
        if (fs.existsSync(dir)) {
            removeDir(dir);
            removed += 1;
            // eslint-disable-next-line no-console
            console.log(`Pruned optional tooling from packaged node_modules: ${name}`);
        }
    });
    // eslint-disable-next-line no-console
    console.log(`Pruned ${removed} optional tooling package(s) prior to RPM packaging`);
} catch (error) {
    // surface the failure so the build does not silently ship the optional tooling
    console.error('Error pruning packaged node_modules:', error); // eslint-disable-line no-console
    process.exit(1);
}
