/*
 * Copyright 2023. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 *
 * Usage: node auditProcessor.js --help
 */

'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const yargs = require('yargs');

// These paths are build-time constants resolved from the current working
// directory; no value originates from user input or any external source. The
// detect-non-literal-fs-filename findings on the fs.* calls that use them are
// therefore false positives (CWE-22 path traversal is not reachable here).
const PACKAGE_JSON = path.join(process.cwd(), 'package.json');
const AUDIT_REPORT = path.join(process.cwd(), '.auditReport.json');
const DEFAULT_EXIT_CODE = 0;

class AuditProcessor {
    constructor() {
        this.report = {};
        this.vulnerabilities = [];
        this.exitCode = DEFAULT_EXIT_CODE;
    }

    log(msg) {
        console.log(msg); // eslint-disable-line no-console
    }

    /**
    * Load report - Loads "npm audit --json" output
    *
    * @returns {Void}
    */
    loadReport() {
        // nosemgrep: eslint.detect-non-literal-fs-filename -- AUDIT_REPORT is a build-time constant
        if (!fs.existsSync(AUDIT_REPORT)) {
            throw new Error('Please run "npm audit" first.');
        }
        // nosemgrep: eslint.detect-non-literal-fs-filename -- AUDIT_REPORT is a build-time constant
        this.report = JSON.parse(fs.readFileSync(AUDIT_REPORT, 'utf-8'));
    }

    /**
    * Process report
    *
    * @param {Object} options            - function options
    * @param {Array} [options.allowlist] - array containing zero or more ID's to ignore
    *
    * @returns {Void}
    */
    processReport(options) {
        options = options || {};
        const allowlist = options.allowlist || [];

        // parse out vulnerabilities
        if (this.report.auditReportVersion === 2) {
            Object.keys(this.report.vulnerabilities).forEach((key) => {
                // A module's `via` array can contain a mix of concrete advisory
                // objects (its own CVEs) and plain strings (names of other modules
                // it depends on, whose own `via` must be resolved in turn). Resolve
                // *every* entry - not just via[0] - so every advisory affecting this
                // module is checked against the allowlist individually. Checking only
                // via[0] would silently drop any additional advisories on a module
                // whenever via[0] happened to be allowlisted (or already a string).
                const advisories = this._resolveViaAdvisories(this.report.vulnerabilities, key);
                const seenIds = new Set();
                advisories.forEach((advisory) => {
                    if (seenIds.has(advisory.source)) {
                        return;
                    }
                    seenIds.add(advisory.source);
                    this.vulnerabilities.push({
                        module: key,
                        path: this.report.vulnerabilities[key].nodes[0],
                        vulnerability: {
                            id: advisory.source,
                            url: advisory.url,
                            advisory: advisory.url.split('/').slice(-1)[0],
                            recommendation: null
                        }
                    });
                });
            });
        } else {
            this.report.actions.forEach((action) => {
                action.resolves.forEach((item) => {
                    this.vulnerabilities.push({
                        module: action.module,
                        path: item.path,
                        vulnerability: {
                            id: item.id,
                            url: this.report.advisories[item.id].url,
                            advisory: this.report.advisories[item.id].url.split('/').slice(-1)[0],
                            recommendation: this.report.advisories[item.id].recommendation
                        }
                    });
                });
            });
        }
        // determine if any vulnerabilities should be ignored
        if (allowlist.length) {
            this.vulnerabilities = this.vulnerabilities.filter(
                (vuln) => !allowlist.includes(vuln.vulnerability.id) && !allowlist.includes(vuln.vulnerability.advisory)
            );
        }
    }

    /**
    * Notify - Determine exit code, what should be logged
    *
    * @returns {Void}
    */
    notify() {
        // check for vulnerabilities and act accordingly
        if (this.vulnerabilities.length) {
            // console.log() truncates arrays over 100 items (Node's default
            // util.inspect array limit), which would silently hide vulnerabilities
            // from CI logs/artifacts once a single module surfaces more than 100
            // advisories. Log the full list explicitly instead.
            this.log(util.inspect(this.vulnerabilities, { maxArrayLength: null, depth: null }));
            this.log(`IMPORTANT: ${this.vulnerabilities.length} vulnerabilities exist, please resolve them!`);
            process.exit(1);
        }
        // good to go
        this.log('No package dependency vulnerabilities exist!');
        process.exit(this.exitCode);
    }

    /**
    * Resolve every advisory object reachable from a module's `via` array.
    *
    * Each entry in `vulnerabilities[key].via` is either a concrete advisory object
    * (has its own `source`/`url`) or a string naming another vulnerable module this
    * one depends on (whose own `via` must be walked in turn to find the concrete
    * advisories). Walks all entries - not just the first - and recurses through
    * string references, guarding against cycles, so every advisory affecting a
    * module (directly or transitively via a dependency name) is returned.
    *
    * @param {Object} vulnerabilities - the full `npm audit` vulnerabilities map
    * @param {String} key             - module name to resolve advisories for
    * @param {Set}    [visited]       - module names already visited (cycle guard)
    *
    * @returns {Array} Flat array of concrete advisory objects
    */
    _resolveViaAdvisories(vulnerabilities, key, visited) {
        visited = visited || new Set();
        if (visited.has(key) || !vulnerabilities[key]) {
            return [];
        }
        visited.add(key);

        const advisories = [];
        vulnerabilities[key].via.forEach((entry) => {
            if (typeof entry === 'string') {
                advisories.push(...this._resolveViaAdvisories(vulnerabilities, entry, visited));
            } else {
                advisories.push(entry);
            }
        });
        return advisories;
    }
}

function main() {
    const argv = yargs
        .version('1.0.0')
        .command('allowlist', 'Allow specific vulnerabilities by ID')
        .example('$0 --allowlist 1234,1235', 'Allow vulnerabilities 1234 and 1235')
        .help('help')
        .argv;

    // nosemgrep: eslint.detect-non-literal-fs-filename -- PACKAGE_JSON is a build-time constant
    const optionsFromConfig = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8')).auditProcessor;
    const parsedArgs = {
        allowlist: argv.allowlist || optionsFromConfig.allowlist || ''
    };

    const auditProcessor = new AuditProcessor();
    auditProcessor.loadReport();
    auditProcessor.processReport({
        allowlist: parsedArgs.allowlist.toString().split(',').map((item) => parseInt(item, 10) || item)
    });
    auditProcessor.notify();
}

main();
