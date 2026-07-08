# Changelog

All notable changes to the F5 BIG-IP Cloud Failover Extension (CFE) are
documented in this file, newest version first.

## 2.5.0

BUG FIXES:
* AWS: Override `makeRequest` handling to tolerate an S3 `Tag` element with no
  `Key`, returning valid XML instead of failing.

IMPROVEMENTS:
* Test: Raised nyc coverage thresholds from 80% to 90% (lines, functions,
  branches, statements) and increased unit test coverage to 90% across all
  source modules (`restWorkers/main.js`, `device.js`, all providers,
  `failover.js`, `logger.js`, `config.js`, `telemetry.js`, `util.js`).
* Test: Instrumented functional/acceptance tests for code coverage reporting
  and added combined unit + functional coverage merge.
* Test: Removed unused dev dependencies.

SECURITY:
* Remediated dependency-scan vulnerabilities across runtime and dev/test/doc
  tooling via `resolutions` overrides and the audit allowlist (see `AGENTS.md`).
* Upgraded `axios` from 0.30.3 to >=0.31.1 (12 CVEs).
* Remediated `xmldom` vulnerabilities in the `cruftless` dependency (7 CVEs).
* Remediated `cidr-js` transitive dependency vulnerabilities (5 CVEs).
* Upgraded `ajv` from 6.12.6 to >=6.14.0 (1 CVE).
* Evaluated/triaged `ip-address` XSS advisory (unreachable; allowlisted).
* lodash: declared as a direct runtime dependency pinned to `4.18.1` to fix a
  production `Cannot find module 'lodash'` failure (cruftless relies on a
  hoisted lodash) while clearing the `_.template` prototype-pollution advisories.

## 2.4.0

FEATURES:
* Added filename option for the cloud state file.
* AWS: Added support for VPC endpoint (VPCE) lookups.
* AWS: Added `ipv4Prefix` support.
* AWS: Added AWS China support.
* AWS: Added Private Link to S3 bucket via VPC endpoint.
* GCP: Added support for multi-zone / multi-peer clusters.

BUG FIXES:
* Resolved auto phone-home issue when using Private Link in isolated
  environments.

IMPROVEMENTS:
* docs: Updated documentation for configuration, AWS, AWS same-AZ, GCP, and
  Azure user guides.
* Test: Added functional test for isolated environment with Private Link.
* chore: Updated functional tests to support a `bigip_version` parameter.

## 2.2.0

IMPROVEMENTS:
* Baseline release. For detailed per-release documentation history prior to and
  including this version, see `docs/revision-history.rst`.
