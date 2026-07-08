'use strict';

/*
 * Merge istanbul/nyc coverage output from the unit test run (.nyc_output) and
 * the functional test run (.nyc_output_functional) into a single temp dir
 * (.nyc_output_combined) so a unified report can be generated with:
 *
 *     nyc report --temp-dir ./.nyc_output_combined ...
 *
 * Either input directory may be absent (e.g. functional tests did not run in a
 * given pipeline), so each is merged only when present and non-empty. The merge
 * runs `nyc merge <inputDir> <outputFile>` via child_process so the same nyc
 * already used by the project performs the istanbul-format merge.
 *
 * NOTE: functional coverage only reflects code that executes in the CI test
 * process (the test harness and any in-process src requires). The CF extension
 * itself runs remotely inside restnoded on the BIG-IP and is not captured here.
 * See AGENTS.md "Functional test coverage".
 *
 * Security note: every filesystem path used below is derived from build-time
 * constants (__dirname + fixed .nyc_output* directory names); no value comes
 * from user input, so the detect-non-literal-fs-filename findings on the fs.*
 * calls are false positives (CWE-22 path traversal is not reachable here).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const combinedDir = path.join(repoRoot, '.nyc_output_combined');
const nycBin = path.join(repoRoot, 'node_modules', '.bin', 'nyc');

// inputDir -> output filename within the combined dir
const inputs = [
    { dir: path.join(repoRoot, '.nyc_output'), out: 'unit.json' },
    { dir: path.join(repoRoot, '.nyc_output_functional'), out: 'functional.json' }
];

function hasCoverage(dir) {
    // nosemgrep: eslint.detect-non-literal-fs-filename -- dir is a fixed inputs[] entry under repoRoot
    if (!fs.existsSync(dir)) {
        return false;
    }
    // nyc merge only makes sense when the dir contains coverage json files
    // nosemgrep: eslint.detect-non-literal-fs-filename -- dir is a fixed inputs[] entry under repoRoot
    return fs.readdirSync(dir).some((f) => f.endsWith('.json'));
}

try {
    // reset the combined temp dir
    // nosemgrep: eslint.detect-non-literal-fs-filename -- combinedDir is a build-time constant
    fs.rmdirSync(combinedDir, { recursive: true });
} catch (err) {
    // ignore - dir may not exist yet
}
// nosemgrep: eslint.detect-non-literal-fs-filename -- combinedDir is a build-time constant
fs.mkdirSync(combinedDir, { recursive: true });

let merged = 0;
inputs.forEach(({ dir, out }) => {
    if (!hasCoverage(dir)) {
        // eslint-disable-next-line no-console
        console.log(`Skipping coverage merge for '${dir}' (not present or empty)`);
        return;
    }
    execFileSync(nycBin, ['merge', dir, path.join(combinedDir, out)], { stdio: 'inherit' });
    merged += 1;
    // eslint-disable-next-line no-console
    console.log(`Merged coverage from '${dir}' -> .nyc_output_combined/${out}`);
});

if (merged === 0) {
    // eslint-disable-next-line no-console
    console.error('No coverage data found to merge (.nyc_output / .nyc_output_functional both missing or empty)');
    process.exit(1);
}
