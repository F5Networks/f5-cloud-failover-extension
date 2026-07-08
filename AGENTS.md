# AGENTS.md

## Project

F5 BIG-IP Cloud Failover (CF) iControl LX extension. Provides L3 failover
functionality in cloud environments (AWS, Azure, GCP), replacing Gratuitous ARP.
During failover events it moves/updates cloud resources: IP associations, NIC
configurations, route tables, and forwarding rules to point to the active BIG-IP
device.

- Package name: `f5-cloud-failover`
- Version: 2.4.0
- Node.js >= 8.11.1 (CI runs on Node 14)
- Test framework: Mocha + Sinon + nyc (Istanbul)
- Linter: ESLint (extends `@f5devcentral/eslint-config-f5-atg`)

## Layout

```
src/nodejs/                      # All application source
  restWorkers/main.js            # iControl LX REST worker entrypoint
  config.js                      # Configuration handler
  constants.js                   # All constants, cloud env configs, XML templates
  device.js                      # BIG-IP device interaction
  failover.js                    # Core failover orchestration logic
  logger.js                      # Logging utility
  telemetry.js                   # F5 TEEM telemetry
  util.js                        # HTTP requests, retrier, helpers
  validator.js                   # JSON schema validation
  schema/                        # JSON schemas and schema utilities
  providers/                     # Cloud provider implementations
    cloudFactory.js              # Factory: instantiates provider by environment name
    abstract/cloud.js            # Base class defining provider interface
    aws/cloud.js                 # AWS (EC2, S3, EIP, route tables, prefix lists)
    azure/cloud.js               # Azure (NICs, IP configs, UDR, storage accounts)
    gcp/cloud.js                 # GCP (alias IPs, forwarding rules, routes, GCS)
test/
  constants.js                   # Test constants
  shared/util.js                 # Shared test utilities (HTTP, auth, base64)
  unit/                          # Unit tests (mocha + sinon)
    providers/                   # Provider-specific unit tests
      awsProviderTests.js
      azureProviderTests.js
      gcpProviderTests.js
      abstractProviderTests.js
      cloudFactoryTests.js
    failoverTests.js
    deviceTests.js
    utilTests.js
    ...                          # Other module tests
  functional/                    # Functional/integration tests (require real cloud infra)
    tests/providers/{aws,azure,gcp}/
scripts/                         # Build, deploy, audit scripts
specs/                           # OpenAPI spec (openapi.yaml) and dredd hooks
contributing/                    # Architecture docs, failover diagrams
docs/                            # Sphinx documentation source
```

## Commands

```bash
npm run lint              # ESLint: src test specs scripts
npm run test-only         # Unit tests only (mocha, no coverage)
npm run test              # Unit tests with nyc coverage
npm run check             # Check coverage meets thresholds
npm run report            # Generate HTML coverage report
npm run build-rpm         # Build RPM package
npm run functional-test   # Functional tests (requires deployed infra)
```

### Run a single test file

```bash
# Unit test for a specific provider
node_modules/.bin/mocha --recursive "./test/unit/providers/gcpProviderTests.js"

# Unit test with coverage for a specific provider
node_modules/.bin/nyc --reporter=text node_modules/.bin/mocha --recursive "./test/unit/providers/gcpProviderTests.js"

# All unit tests with coverage
npm test
```

### Run a single test by name

```bash
node_modules/.bin/mocha --recursive --grep "validate _updateFwdRule" "./test/unit/providers/gcpProviderTests.js"
```

### Dependency changes

**Any change to dependencies (adding, removing, or bumping a package in
`package.json`) MUST be followed by `npm run install-all` to regenerate
`package-lock.json` consistently.** Do not hand-edit `package-lock.json` and do
not rely on a bare `npm install`.

`install-all` runs the full project install pipeline that the lockfile depends
on -- the `npm-force-resolutions` preinstall, the cruftless `patch-package`
postinstall, and the post-install cleanup steps (`remove_vulnerable_xmldom.js
--lockfile` and `remove_resolved.js`). A plain `npm install` skips the lockfile
stripping (it only runs the disk-only postinstall), so the committed lockfile
would drift from the remediated state.

```bash
# after editing dependencies in package.json
npm run install-all
# then commit BOTH package.json and package-lock.json together
```

Always commit `package.json` and the regenerated `package-lock.json` in the same
change.

### RPM packaging excludes optional tooling

`f5-cloud-failover.spec` copies `node_modules` into the RPM wholesale. The doc/
spec/test tooling declared under `optionalDependencies` (`redoc`, `redoc-cli`,
`dredd`, `mermaid.cli`, `openapi-to-postmanv2`) is only used at build time and is
never executed by the running extension, but npm 6 keeps lockfile-pinned optional
deps even with `--no-optional`, so they would otherwise be packaged (and flagged
by dependency scanners). `scripts/build_rpm.sh` therefore runs
`scripts/prune_packaged_modules.js` after `install-production` and before
`rpmbuild` to delete those optional tooling trees from the packaged
`node_modules`. The script guards against removing anything a runtime
`dependencies` entry actually requires.

When triaging a dependency-scanning report, scope findings to the **shipped**
tree (`npm install --production --no-optional`, minus the pruned optional
tooling) -- a full dev install reports many vulnerabilities in build/test tooling
(`dompurify`, `handlebars`, `marked`, etc. via redoc/dredd) that are not in the
RPM.

After pruning, the remaining shipped vulnerabilities are deep transitive
dependencies of the runtime `dependencies` (`@automation-toolchain/f5-cloud-libs`,
`@f5devcentral/f5-teem`). Those with a backward-compatible patched version are
forced via the `resolutions` block (`npm-force-resolutions`): `braces`,
`picomatch`, `qs`, `js-yaml`, and `@babel/traverse`. The rest are accepted:

The `resolutions` block also remediates vulnerabilities in **dev/test/doc
tooling** transitive deps (these are not in the shipped RPM, but are flagged by
the full GitLab dependency-scanning report which scans the whole lockfile).
Forced to patched versions: `@babel/core` (>=7.29.6), `@babel/helpers`
(>=7.26.10), `@tootallnate/once` (>=2.0.1), `fast-xml-parser` (>=5.7.0, pulled by
`@google-cloud/storage`), `flatted` (>=3.4.2), `json5` (>=2.2.3), `jws`
(>=4.0.1), `serialize-javascript` (>=7.0.6), and `xml2js` (>=0.6.2, overriding
the exact pin in `aws-sdk`). The direct devDependency `ssh2` was also bumped
(`^0.8.2` -> `^1.17.0`) to clear its Critical advisory; it is unused in source
and tests, and its optional native crypto binding fails to build on Node 14 but
falls back to pure JS (the `npm WARN ... SKIPPING OPTIONAL DEPENDENCY
cpu-features` during install is expected and harmless). The dev-only `aws-sdk`
Low advisory (`GHSA-j965-2qgj-vjmq`, "migrate to SDK v3") has no non-breaking
fix; it is not flagged by `npm run audit` (which is `--production`), so it needs
no allowlist entry.

**`xml2js` override risk:** the `xml2js` (>=0.6.2) resolution force-overrides
`aws-sdk`'s exact `0.4.19` pin. `xml2js` 0.5/0.6 changed parser defaults relative
to 0.4 (e.g. `explicitArray`, attribute handling), so callers that relied on
0.4-era parsing behaviour could see subtly different output. This is accepted
because `aws-sdk` is dev-only (functional/test harness, not shipped in the RPM)
and the current unit + functional suites pass. The risk to watch: if future
functional tests exercise AWS S3/EC2 XML response parsing more deeply, parsing
differences could surface as hard-to-trace failures. If that happens, narrow the
override (the CVE is fixed from 0.5.0, so `>=0.5.0 <1.0.0` stays closer to 0.4
behaviour than 0.6) or pin `aws-sdk`'s nested `xml2js` specifically rather than
the global resolution. Re-evaluate when migrating `aws-sdk` to v3 (SDK v3 does
not use `xml2js`).

- **`lodash`** -- declared as a direct runtime `dependency` pinned to exactly
  `4.18.1`, NOT a `resolutions` override. `cruftless` does `require('lodash')`
  without declaring it and relies on a hoisted top-level `lodash`. In a dev
  install that happens by accident (dev/optional deps pull lodash in and it
  hoists), but a production install (`npm install --production --no-optional`,
  i.e. the RPM/device tree) installs none of those, so nothing pulled lodash in
  and `cruftless` failed at runtime on the BIG-IP with `Cannot find module
  'lodash'` (surfaced as `Failover initialization failed: Cannot find module
  'lodash'`). Declaring it as a direct dependency guarantees a hoisted top-level
  lodash in both dev and production trees. It must NOT be added to the
  `resolutions` block -- forcing a single version de-hoists it and re-breaks
  cruftless. The version is pinned to `4.18.1` (not the older `4.17.21`) because
  promoting lodash to a production dependency surfaces it in `npm run audit
  --production`: the `_.template` code-injection / prototype-pollution advisories
  (CVE-2026-4800 / GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh, and
  GHSA-xxjr-mmjv-4gpg) affect `<= 4.17.23` and are patched in `4.18.0`. Those
  advisories are not actually reachable in this extension (neither `src/` nor
  `cruftless`'s template engine calls lodash's `_.template`), but `4.18.1` clears
  them at the source so the audit gate passes without an allowlist entry.
- **`async@1.0.0`** (via f5-cloud-libs) -- the fix is a major bump (2.x/3.x) with
  breaking API changes; `npm audit` does not flag it, and the prototype-pollution
  path is not reachable with attacker-controlled input here.
- **`uuid` / `ip-address` / `ajv`** -- see "Security audit allowlist" below
  (uuid v4-only, ip-address HTML methods unused, ajv direct dep already patched).

## CI

- **GitLab CI** (`.gitlab-ci.yml`): Primary CI. Stages: content checks,
  lint + unit tests (Node 14), npm audit, RPM build, functional tests across
  all three clouds (AWS/Azure/GCP with multiple topology variants), doc builds,
  artifact publishing to Artifactory/CDN/GitHub.
- **No GitHub Actions CI** -- GitHub is used only for public issue tracking and
  release publishing. The `.github/` directory contains only an issue template.
- Functional tests require deployed BIG-IP infrastructure and are run in
  separate init/execute/cleanup stages per cloud provider.

### Coverage enforcement

Coverage thresholds are configured in `package.json` under the `"nyc"` key:

```json
"nyc": {
    "check-coverage": true,
    "lines": 90,
    "functions": 90,
    "branches": 90,
    "statements": 90
}
```

All four metrics (lines, functions, branches, statements) must meet **90%**.
`npm run check` enforces this. The thresholds apply globally across all files
included in the test run, not per-file.

```bash
# Check coverage locally
npm test           # runs nyc + mocha
npm run check      # verifies thresholds
npm run report     # generates HTML report in coverage/
```

### Security audit allowlist

`npm run audit` runs `npm audit --production` and pipes the result through
`scripts/auditProcessor.js`, which fails the build on any advisory not present in
the `auditProcessor.allowlist` array in `package.json`. The allowlist holds
numeric npm advisory IDs that have been triaged and accepted. Because
`package.json` is JSON (no inline comments), record the rationale for each
accepted advisory here:

- **1118827** -- `ip-address` XSS (CVE-2026-42338 / GHSA-v2v4-37r5-5v8g,
  Moderate). The vulnerability is only reachable through `Address6`'s
  HTML-emitting methods (`.group()`, `.link()`, `.href()`, and `parseMessage`
  HTML error output). This project never calls any of those -- it uses only
  `.isValid()`, `.isInSubnet()`, `.bigInteger()`, `.startAddress()`,
  `.endAddress()`, and `.correctForm()` -- and the extension emits JSON, not
  HTML. The fix is a major upgrade (`ip-address` 6.x -> >=10.1.1) with breaking
  API changes, which is not justified for an unreachable issue. Re-evaluate if
  the project ever renders ip-address output as HTML or upgrades the dependency.

- **1119441** -- `uuid` missing buffer bounds check (CVE-2026-41907 /
  GHSA-w5hq-g745-h8pq, Moderate). The vulnerability is only in the `v3()`,
  `v5()`, and `v6()` API methods when the caller passes an output `buf`
  argument; the advisory explicitly states `v4()`, `v1()`, and `v7()` are not
  affected (they throw `RangeError` on bad bounds). This project uses only
  `uuid` `v4()` with no buffer (`telemetry.js`: `clientRequestId: uuidv4()`),
  so it is not exposed. The fix is `uuid` >=11.1.1, a major jump from the 3.x
  line that is also ESM-only -- incompatible with this CommonJS project on
  Node 14 without an import/interop rewrite. Not justified for an unreachable
  issue. Re-evaluate if the project starts using `v3()`/`v5()`/`v6()` with a
  buffer or migrates to ESM.
### Functional test coverage

Functional/acceptance tests (`npm run functional-test`) are **black-box** tests:
mocha runs in the CI runner and exercises the extension over HTTP/REST against a
deployed BIG-IP. The `src/nodejs` code under test executes remotely inside
`restnoded` on the device, **not** in the CI Node process.

Because nyc/istanbul can only instrument the local process it wraps, functional
coverage captures the **functional test harness** (`test/functional/**`,
`test/shared/**`) plus any `src` modules the harness `require`s in-process (e.g.
`util._expandCIDR`). It does **not** measure `src/nodejs` code that runs on the
BIG-IP. Measuring on-device coverage would require building an instrumented RPM,
deploying it, and retrieving the device-side coverage data -- not currently done.

```bash
# Run functional tests under nyc (writes raw data to .nyc_output_functional/
# and an lcov/text report to coverage-functional/)
npm run functional-test-coverage

# Merge unit (.nyc_output) + functional (.nyc_output_functional) coverage into
# a combined report under coverage-combined/ (tolerant of missing inputs)
npm run coverage-merge
```

In CI, every `test_functional_execute_*` job runs `functional-test-coverage` and
uploads `coverage-functional`/`.nyc_output_functional` as artifacts; the
`merged_coverage` job (in the `test_functional_cleanup` stage) pulls the unit
`coverage` job's `.nyc_output` and the functional artifacts and runs
`coverage-merge` to produce the combined `coverage-combined` artifact.

## Architecture

The extension runs as an iControl LX REST worker on BIG-IP. Key flow:

1. **Configuration** (`POST /mgmt/shared/cloud-failover/declare`): Stores user
   config in REST storage, writes state to cloud storage, configures
   `/config/failover/tgactive` and `/config/failover/tgrefresh` scripts.

2. **Failover** (`POST /mgmt/shared/cloud-failover/failover`): Reads config
   from REST storage and state from cloud storage, discovers current cloud
   resource state, computes required changes, and updates cloud resources
   (IPs, routes, forwarding rules).

### Provider pattern

All cloud providers extend `AbstractCloud` (`providers/abstract/cloud.js`)
which defines the interface and shared logic (retrier, route operations,
address operation generation, tag normalization). Each provider implements:

- `init()` -- Authenticate and discover cloud resources
- `getAssociatedAddressAndRouteInfo()` -- Inspect current state
- `updateAddresses()` / `discoverAddresses()` -- IP failover
- `updateRoutes()` -- Route failover
- `uploadDataToStorage()` / `downloadDataFromStorage()` -- State persistence

The factory (`cloudFactory.js`) instantiates the correct provider based on the
`environment` field in the configuration declaration.

## Testing patterns

### Unit tests (sinon stubs)

Unit tests use `sinon` for stubbing. The standard pattern:

- `beforeEach`: Create provider instance, stub `Device.prototype.init` and
  `Device.prototype.getProxySettings`, set up logger stubs on the provider.
- `afterEach`: `sinon.restore()` to clean up all stubs.
- Provider methods that make HTTP calls (`_makeRequest`, `_sendRequest`) are
  stubbed to return mock responses.
- The `_retrier` method wraps `util.retrier` with configurable retry counts
  and intervals. In tests that exercise methods using `_retrier` internally
  (such as `_updateFwdRules`, `_updateRoutes`, `_updateNics`,
  `_reassociateAddresses`), stub `_retrier` to call the function directly
  without retries to avoid test timeouts:
  ```js
  sinon.stub(provider, '_retrier').callsFake((fn, args) => fn.apply(provider, args));
  ```
- For methods like `_makeRequest` that may already be stubbed by `beforeEach`,
  use direct assignment (`srcUtil.makeRequest = sinon.stub()...`) instead of
  `sinon.stub(srcUtil, 'makeRequest')` to avoid "already stubbed" errors.

### Functional tests (real cloud infrastructure)

Located in `test/functional/`. Require deployed BIG-IP instances and cloud
infrastructure. Run via `npm run functional-test`. Cloud-specific tests are in
`test/functional/tests/providers/{aws,azure,gcp}/tests.js`.

### Known source issues

- **AWS `_getBucketTags` missing return** (`aws/cloud.js:2217`): The catch
  handler is missing a `return` before the ternary expression, so errors are
  silently swallowed regardless of `continueOnError`. Tracked as
  `TODO(COREBIP-43761)` in the test file.
- **GCP proxy auth dead code** (`gcp/cloud.js:86-89`): The `if (opts.username
  && opts.password)` branch is unreachable because `url.parse()` does not
  populate `username`/`password` properties. Similar issue exists in Azure
  (`azure/cloud.js:79-80`).

## ESLint configuration

ESLint config is in `package.json` under `"eslintConfig"`. Extends
`@f5devcentral/eslint-config-f5-atg` (Airbnb base). Notable overrides:

- `max-classes-per-file`: off
- `func-names`: off

The `.eslintignore` file excludes `src/nodejs/providers/aws/*.js` from linting
(the AWS provider uses raw XML templates via cruftless that conflict with
standard rules).

```bash
npm run lint    # eslint src test specs scripts
```

## Code comments

- **Do not include line number references in comments** when writing tests or
  adding code. Line numbers become stale as code evolves. Instead, describe
  what code path or function is being exercised (e.g., "exercises the
  conditionNotMet error handler in _updateNic" not "exercises line 1192").

## Promise patterns

This codebase uses `.then()/.catch()` promise chains throughout (not
async/await). Follow the existing pattern:

```js
return this._someMethod()
    .then((result) => {
        // handle result
        return Promise.resolve(result);
    })
    .catch((err) => Promise.reject(err));
```

Return promises from test cases so mocha can track them. Missing `return`
before a promise chain is a recurring bug pattern -- the test always passes
regardless of assertion outcomes.
