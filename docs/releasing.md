# Releasing

One npm package serves every language and its root is the repository root. It is published to npm as
`nitpicker` (MIT, unscoped). Nothing here runs automatically: a release is a manual sequence done by
a maintainer.

## Versioning and tags

- First version: **0.1.0**. The engine, preset and report format are complete and tested, but the
  README still lists a language-neutral `spec/` as not done and the report and config surface may
  change, so the package starts below 1.0.0. Until 1.0.0, a minor bump may contain breaking changes
  and a patch bump is fixes only. Move to 1.0.0 when the config keys, exit codes and report files
  are declared stable.
- Tag format: `v<version>`, for example `v0.1.0`. One package serves every language, so the tag
  carries no language prefix. The tag must equal `package.json` `version` and point at a commit on `main`. Tags are created only at
  release time, never ahead of it.
- Pre-releases use a suffix (`v0.2.0-rc.1`) and are published with
  `npm publish --tag next`.
- Floating tags let workflows follow a release line of the GitHub action (`action.yml`):
  `v0.<minor>` before 1.0 (a minor bump may break, so the line is the minor) and `v<major>` from
  1.0. A stable release moves its floating tag to the release commit; a pre-release never does,
  so `uses: jhonDoe15/nitpicker@v0.2` never runs a release candidate. A floating tag only moves
  forward: a release whose commit does not contain the commit the tag points at leaves it alone
  and fails, so a fix released on an older line cannot pull a workflow back. Workflows that need
  a fixed version pin a full tag (`@v0.2.1`) or a full commit SHA instead.

## Checklist

Work from a clean checkout of `main` with full history.

1. **Prerequisites.**
   - Everything intended for the release is merged to `main` and CI (`typescript` workflow) is green.
   - Node.js 22.14 or newer (the `engines` floor) and an npm account with publish rights on
     `nitpicker` and two-factor authentication on (npm requires it to publish). Run `npm whoami`.
     The first publish creates the package, so it needs no prior rights.
   - `LICENSE` is at the repository root, which is also the package root, so npm packs it as is.
     The installed-package test asserts the packed copy matches the root file.
   - The README's claims match the release, and the "Container image" section of
     [usage.md](usage.md) still says no image is published (update it once one is pushed).
   - The npm page renders the README and resolves its relative links against the GitHub
     repository. While the repository is private, those links (docs, LICENSE, CONTRIBUTING) open
     only for people with access to it.
   - The comparison in [comparison.md](comparison.md) states no unmet prerequisite for the release;
     re-read it if the fingerprinting or enforceable/report-only behaviour changed since it was
     written.
2. **Bump the version.** At the repository root:
   `npm version <new-version> --no-git-tag-version`. This updates `package.json` and
   `package-lock.json`. Commit it (`Release v<new-version>`) through a normal PR to `main`.
3. **Test.**
   ```sh
   npm ci
   npx vitest run --config vitest.config.mts
   npm run test:installed
   ```
   Both must be green. `test:installed` packs the tarball and installs it into hoisted, nested and
   linked consumers, so it is the real check of the package contents.
4. **Dry run.** `npm pack --dry-run` from the repository root. Confirm `LICENSE`, `README.md`,
   `package.json`, `core/`, `shared/` and `languages/` are listed, and no tests, fixtures,
   `node_modules` or reports are. Then `npm publish --dry-run`.
5. **Tag** the merged release commit and push the tag, and for a stable release move its floating
   tag (`v0.<minor>` before 1.0, `v<major>` from 1.0) to the same commit:
   ```sh
   git tag v<new-version> <commit>
   git push origin v<new-version>
   git fetch --no-tags origin '+refs/tags/v0.<minor>:refs/tags/v0.<minor>'  # skip if it does not exist yet
   git merge-base --is-ancestor v0.<minor> <commit>   # must succeed: the tag only moves forward
   git tag -f v0.<minor> <commit> && git push --force origin refs/tags/v0.<minor>
   ```
6. **Publish** from the repository root:
   ```sh
   npm publish
   ```
   npm asks for a one-time password. Add `--tag next` for a pre-release. The package is unscoped,
   so no `--access` flag is needed.
7. **Verify.** In an empty directory: `npm view nitpicker version`, then
   `npm install --save-dev nitpicker typescript @types/node && npx nitpicker --help`.
8. **GitHub release.** From the tagged commit, create a release from the tag with generated notes,
   edited as needed, and attach the packed tarball so the version can be installed without npm (see
   [Install from a GitHub release](usage.md#from-a-github-release)):

   ```sh
   rm -rf release-assets && mkdir release-assets && npm pack --pack-destination release-assets
   (cd release-assets && shasum -a 256 nitpicker-*.tgz > SHA256SUMS)
   gh release create v<new-version> release-assets/* --verify-tag --generate-notes
   ```

   Add `--prerelease` for a pre-release. A release can also go out on GitHub alone, before or
   without step 6: steps 1 to 5 still apply, and the tarball is the same file npm would publish.
   Verify it by installing the attached tarball in an empty directory as
   [Install from a GitHub release](usage.md#from-a-github-release) shows.

   The `github-release` workflow does the same from the Actions tab: run it with the full SHA of the
   release commit on `main`. It creates the tag `v<version>` from that commit's `package.json`,
   attaches the tarball and `SHA256SUMS`, moves the floating tag unless `prerelease` is set or
   the version has a suffix (the step runs after the release is created, so when it fails, for
   example because the tag would move backwards or a tag ruleset of the repository blocks the
   forced push, the release stays published and the floating tag is moved by hand as in step 5),
   and takes its notes from
   `.github/release-notes/v<version>.md`, which must be on `main` first. Write the notes without
   personal names: generated notes credit PR authors.

## Container image

The root `Dockerfile` installs the package from source with `npm ci --omit=dev`, so it must be built
from the same commit as the tag.

```sh
docker build -t nitpicker:<new-version> .
docker run --rm nitpicker:<new-version> --help
docker run --rm -v "$PWD":/work nitpicker:<new-version>   # against a checkout
```

Smoke-test it against a repository with a clean and a dirty branch, as the README describes. Pushing
the image to a registry is a separate decision: no registry is configured, and the README says no
image is published. If one is added, tag it with the same version (and `latest` for stable releases)
and update the README sentence.

## Automation

There is no npm publish workflow, and none runs on push. The `github-release` workflow only
creates GitHub releases, and only when run by hand. The first publish is manual, because npm can
only attach a trusted publisher to a package that already exists. If publishing is later automated
it must be a manual `workflow_dispatch` job that authenticates through npm trusted publishing
(OIDC) rather than a long-lived token, not a trigger on tags or branches. npm provenance needs a
public repository, so it applies only once this one is public.
