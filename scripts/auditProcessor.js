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
const yargs = require('yargs');

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
        if (!fs.existsSync(AUDIT_REPORT)) {
            throw new Error('Please run "npm audit" first.');
        }
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
                this.report.vulnerabilities = this._resolveVia(this.report.vulnerabilities, key);
                this.vulnerabilities.push({
                    module: key,
                    path: this.report.vulnerabilities[key].nodes[0],
                    vulnerability: {
                        id: this.report.vulnerabilities[key].via[0].source,
                        url: this.report.vulnerabilities[key].via[0].url,
                        advisory: this.report.vulnerabilities[key].via[0].url.split('/').slice(-1)[0],
                        recommendation: null
                    }
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
            this.log(this.vulnerabilities);
            this.log(`IMPORTANT: ${this.vulnerabilities.length} vulnerabilities exist, please resolve them!`);
            process.exit(1);
        }
        // good to go
        this.log('No package dependency vulnerabilities exist!');
        process.exit(this.exitCode);
    }

    _resolveVia(vulnerabilities, key) {
        while (typeof vulnerabilities[key].via[0] === 'string') {
            let count = 0;
            if (vulnerabilities[key].via[0] === vulnerabilities[vulnerabilities[key].via[0]].via[0]) {
                count += 1;
            }
            vulnerabilities[key].via[0] = vulnerabilities[vulnerabilities[key].via[0]].via[count];
        }
        return vulnerabilities;
    }
}

function main() {
    const argv = yargs
        .version('1.0.0')
        .command('allowlist', 'Allow specific vulnerabilities by ID')
        .example('$0 --allowlist 1234,1235', 'Allow vulnerabilities 1234 and 1235')
        .help('help')
        .argv;

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
