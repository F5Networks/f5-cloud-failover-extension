---
name: release-cfe-to-github
description: Use when releasing / publishing f5-cloud-failover (CFE, the Cloud Failover Extension) to the public GitHub repo F5Networks/f5-cloud-failover-extension. Covers version bumps, updating CHANGELOG.md, the release branch + merge-to-master flow, and publishing via the publish_to_github CI pipeline job (triggered by a publish-v<version>-<build> ref) which tags, creates the GitHub Release, and uploads the RPM + hash — plus manually attaching the Postman collection and a manual git fallback. Trigger on requests like "release CFE to GitHub", "publish a new CFE version", "cut a release", "do a CFE release", "run publish_to_github", "update the changelog".
---

# Releasing CFE to GitHub

The **primary release method is the `publish_to_github` CI pipeline job** in
`.gitlab-ci.yml`, driven by `scripts/publish_github.sh`. You bump the three
version files, finalize `CHANGELOG.md`, merge to `master`, then push a specially
named `publish-v<version>-<build>` ref that triggers the CI job to publish to
GitHub automatically (snapshot push, tag, GitHub Release, RPM + hash upload).

The repo's [`RELEASE.md`](../../../RELEASE.md) documents an equivalent **manual
git/GitHub flow**, kept here as a fallback (see "Manual fallback flow" below).
If `RELEASE.md` and this skill disagree on the manual steps, `RELEASE.md` is
authoritative — re-read it before releasing manually.

## Remotes

- `origin` → internal GitLab (the `automation-sdk/f5-cloud-failover` project)
- `github` → public: `github.com/F5Networks/f5-cloud-failover-extension`


Note: inside the CI job, `scripts/publish_github.sh` **repoints `origin`** at the
public GitHub URL for the duration of the job. That is job-local and does not
affect your local checkout's remotes.

## Version must be bumped in THREE places

For a release version `X.Y.Z` (example: `1.0.0`), update all three:

1. **`package.json`** — the top-level `"version"` property.
2. **`src/nodejs/schema/base_schema.json`** — the `schemaVersion` property. This
   is an **enum**, not a plain string: add the new version as the **first**
   entry in the enum array (kept sorted most-recent-first, per the `$comment` in
   the file). Do not remove older supported versions.
3. **`specs/openapi.yaml`** — the `version` field. Note there are multiple
   `version:` occurrences; update the top-level `info.version` (line ~3) and the
   example/schema `version` values that reflect the release (e.g. the `~2.4.0`
   examples). Grep for the previous version string to catch every spot:
   ```bash
   grep -rn "2\.4\.0" specs/openapi.yaml
   ```

Keep all three in sync — a mismatch between `package.json` and `schemaVersion`
will fail schema validation / functional tests.

## Primary method: the `publish_to_github` CI job

The `publish_to_github` job (`.gitlab-ci.yml`, `stage: publish`) runs
`scripts/publish_github.sh`. It is gated to run **only** on refs matching:

```
publish-v(\d+\.){1,2}(\d)-(\d+)?      # e.g. publish-v2.5.0-1
```

i.e. `publish-v<version>-<build>`. Pushing such a ref is what triggers the
release; normal commits to `master`/`develop` do NOT trigger it.

### What the job does (do not redo these by hand)

Given ref `publish-v2.5.0-1`, the script parses `RELEASE_VERSION=v2.5.0`,
`RELEASE_VERSION_SHORT=2.5.0`, `RELEASE_BUILD=1`, then:

1. Points `origin` at `git@github.com:f5networks/f5-cloud-failover-extension.git`
   and rebuilds the tree from the **allowlist** (`ALLOWED_DIRS`/`ALLOWED_FILES`
   in `scripts/publish_github.sh`) — `src`, `test`, and source-build files are
   intentionally excluded.
2. **Force-pushes** that snapshot to GitHub `master` (`git push -f`).
3. Tags `v2.5.0` and pushes the tag to GitHub.
4. Pulls the **release description from the GitLab Releases API**
   (`releases/<CI_COMMIT_REF_NAME>`) and POSTs to the GitHub Releases API
   (auth `$GITHUB_API_TOKEN`) to create a non-draft, non-prerelease release.
5. Uploads the **RPM and its `.sha256`** from
   `./dist/new_build/f5-cloud-failover-<version>-<build>.noarch.rpm(.sha256)`
   to the release assets.

### Release procedure using the CI job

1. Ensure **all feature branches (including documentation) are merged into
   `develop`**.
2. **Run the functional test pipeline on `develop`** and validate it passes.
3. Create a **release branch** and **bump the three version files**
   (`package.json`, `base_schema.json` enum first-entry, `specs/openapi.yaml`)
   and **finalize `CHANGELOG.md`** (see "Updating CHANGELOG.md" below):
   ```bash
   git checkout -b R2.5.0
   ```
4. Open a **merge request targeting `master`** (not `develop`) and merge it once
   green. The `master` pipeline builds the RPM/hash into `dist/new_build/`.
5. **Create a GitLab Release** for the release ref whose `description` is the
   finalized `CHANGELOG.md` section — the CI job copies this verbatim into the
   GitHub Release body. Without it, the GitHub Release body is empty/`null`.
6. **Trigger the publish** by pushing the specially named ref from the release
   commit on `master`:
   ```bash
   git push origin master:publish-v2.5.0-1     # <version>-<build>
   ```
   The `publish_to_github` job runs and performs the snapshot push, tag, GitHub
   Release creation, and RPM + `.sha256` upload.
7. **Verify** on GitHub: the `v2.5.0` tag, the Release with correct notes, and
   the RPM + `.sha256` assets attached.
8. **Attach the Postman collection manually.** The CI job does **not** upload
   `examples/postmanCollection.json` — add it to the GitHub Release assets by
   hand after the job completes.
9. Add a fresh `## <next-version> (Unreleased)` block to `CHANGELOG.md` on
   `develop` (see "Updating CHANGELOG.md").

### CI-job caveats

- **It force-pushes GitHub `master`.** History on the public repo is overwritten
  from the allowlisted snapshot each release. This is expected.
- **Version files are NOT bumped by the job.** You must bump all three
  (step 3) before merging to `master`, or the published version is wrong.
- **Postman collection is not uploaded** — attach it manually (step 8).
- **Release body comes from the GitLab Release description**, not `CHANGELOG.md`
  directly — create the GitLab Release (step 5) so the body is populated.
- **RPM/hash must exist** at `./dist/new_build/...` in the job's workspace
  (produced by the RPM build stage on that commit) or the asset upload fails.

## Manual fallback flow

Use this only if the CI job is unavailable. It mirrors `RELEASE.md`.

1. Steps 1–3 above (merge to `develop`, functional pipeline green, release
   branch, bump three version files, finalize `CHANGELOG.md`).
2. Open a **merge request targeting `master`** and merge it.
3. **Tag `master`**:
   ```bash
   git tag -m "release 2.5.0" v2.5.0
   ```
4. Push to internal GitLab (`origin`) and the public GitHub remote — mirroring
   the allowlist exclusion (do NOT push `src`/`test`/build files):
   ```bash
   git push
   git push origin --tags
   git push github master
   git push github --tags
   ```
5. **Create the GitHub Release** (in `F5Networks/f5-cloud-failover-extension`)
   for tag `v2.5.0`, add the `CHANGELOG.md` notes, and attach:
   1. Source code **RPM** (from the release-commit pipeline build)
   2. **RPM hash** file (`.sha256`)
   3. **Postman collection** artifact

## Artifacts

**All artifacts must come from the appropriate pipeline build — the release
commit pipeline** — not a local ad-hoc build. Do not hand-build and upload;
retrieve the RPM, its hash, and the Postman collection from the CI build for the
release commit.

Reference locations for the same artifacts in CI:
- RPM + hash: `dist/new_build/f5-cloud-failover-<version>-<build>.noarch.rpm`
  (`.sha256`) — see `scripts/build_rpm.sh` and the `publish_*_to_artifactory`
  jobs in `.gitlab-ci.yml`.
- Postman collection: `examples/postmanCollection.json`.

## Updating CHANGELOG.md

Maintain a top-level `CHANGELOG.md` in the repo root, newest version first,
using the Keep-a-Changelog / Terraform-provider style (see
`terraform-provider-f5os/CHANGELOG.md` for the reference format).

### Format

- Each version is an H2 heading: `## X.Y.Z` (the in-progress next version is
  `## X.Y.Z (Unreleased)`).
- Under each version, use these UPPERCASE section headers, in this order, and
  omit or leave empty any that don't apply:
  - `BREAKING CHANGES:`
  - `FEATURES:`
  - `BUG FIXES:`
  - `IMPROVEMENTS:`
  - `SECURITY:`
- Each entry is a `*` bullet. Scope entries with a leading component/area where
  useful, e.g. `* CI/CD: ...`, `* AWS: ...`, `* docs: ...`.
- Keep entries user-facing and concise; write from the user's perspective.

### Example

```markdown
## 2.5.0 (Unreleased)

BREAKING CHANGES:
FEATURES:
BUG FIXES:
IMPROVEMENTS:
SECURITY:

## 2.4.0

FEATURES:
* AWS: Added prefix-list support for route failover

BUG FIXES:
* AWS: `_getBucketTags` now returns on error instead of silently swallowing it

IMPROVEMENTS:
* Raised nyc coverage thresholds to 90%

SECURITY:
* lodash: pinned to 4.18.1 to remediate `_.template` prototype-pollution CVEs
```

### Process during a release

1. Keep an `## X.Y.Z (Unreleased)` block at the top during development; add
   entries under the appropriate section as changes merge to `develop`.
2. At release time, in the release branch (release step 3):
   - Change the heading from `## X.Y.Z (Unreleased)` to `## X.Y.Z` (the version
     being released — must match the three version files).
   - Remove any empty section headers that have no entries (optional, but keep
     it clean).
   - Review that every notable change since the last release is captured.
3. Add a fresh `## <next-version> (Unreleased)` block with the empty section
   headers back on top of `develop` after the release (so the next cycle has a
   place to accumulate entries).
4. Use the finalized version's section content as the **GitHub Release notes**
   body. With the CI job, put this content in the **GitLab Release
   `description`** (release step 5) — the `publish_to_github` job copies it into
   the GitHub Release. In the manual fallback, paste it into the GitHub Release
   directly.

Note: `CHANGELOG.md` is developer/GitHub-facing. The Sphinx doc
`docs/revision-history.rst` is a separate, documentation-team-owned revision
table — update it too if the docs changed, but it is not a substitute for
`CHANGELOG.md`.

## What gets published (allowlist)

**Source code is NOT published to the public GitHub repo.** The allowlist in
`scripts/publish_github.sh` (`ALLOWED_DIRS`/`ALLOWED_FILES`) intentionally
excludes `src`, `test`, and the source-build files
(`f5-cloud-failover.spec`, `Dockerfile`, `Makefile`, `make.bat`). Only docs,
examples, specs, and release metadata are pushed; the runnable extension ships
as the RPM attached to the GitHub Release. The primary CI job enforces this
allowlist automatically. If you use the **manual fallback** `git push github
master` step instead, mirror this exclusion by hand — do not push
`src`/`test`/build files to the public repo. To publish a new top-level
dir/file, add it to the allowlist first.

## Gotchas / checklist

- [ ] Three version files bumped and consistent (`package.json`,
      `base_schema.json` enum first-entry, `specs/openapi.yaml`).
- [ ] `CHANGELOG.md` entry finalized: `(Unreleased)` removed from the released
      version heading, all notable changes captured, and a new
      `(Unreleased)` block added on top of `develop`.
- [ ] `develop` functional pipeline green before branching.
- [ ] Release branch MR targets **`master`** (not `develop`); merged and the
      `master` RPM build succeeded (`dist/new_build/...` present).
- [ ] GitLab Release created with the `CHANGELOG.md` notes as its `description`
      (the CI job copies this into the GitHub Release body).
- [ ] Publish triggered by pushing a `publish-v<version>-<build>` ref (matches
      the `publish_to_github` job regex).
- [ ] `publish_to_github` job green; GitHub shows tag `vX.Y.Z`, the Release, and
      the RPM + `.sha256` assets.
- [ ] **Postman collection attached manually** (the CI job does not upload it).
- [ ] All artifacts came from the release-commit pipeline build.
- [ ] (Manual fallback only) Tag is `vX.Y.Z`; pushed to **both** `origin` and
      `github`; source/test/build files not pushed to GitHub.

## Key files

- `.gitlab-ci.yml` — defines the **`publish_to_github`** job (the primary
  release method); gated on the `publish-v<version>-<build>` ref regex.
- `scripts/publish_github.sh` — the script the CI job runs: allowlist snapshot,
  force-push to GitHub `master`, tag, GitHub Release creation, RPM + `.sha256`
  upload.
- `RELEASE.md` — authoritative reference for the manual fallback flow.
- `CHANGELOG.md` — user/GitHub-facing changelog (created/maintained per this
  skill; Keep-a-Changelog style). Its release section is the GitLab/GitHub
  Release body.
- `docs/revision-history.rst` — separate Sphinx docs revision table.
- `package.json`, `src/nodejs/schema/base_schema.json`, `specs/openapi.yaml` —
  the three version locations.
- `scripts/build_rpm.sh` — RPM build (produces `dist/new_build/...` artifacts).
