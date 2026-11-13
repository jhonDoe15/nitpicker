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
  carries no language prefix. The tag must equal `package.json` `version` and point at the release commit: a commit on top of a
  commit on `main` that adds only the generated rule pages (`docs/rules/`), which `main` does not
  commit. Tags are created only at release time, never ahead of it.
- `latest` follows the newest release, pre-releases included, so the README, the guides and the
  skills on `main` link to `blob/latest/docs/rules/`. It only moves forward, like the floating tags.
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
   - Pull requests do not edit [CHANGELOG.md](../CHANGELOG.md); its entry for the release is written
     in step 2. Fetch the tags and enough history to reach the last one:
     `git fetch --depth=2000 origin main --tags`.
   - The README's claims match the release, and the base image versions in the `Dockerfile` are
     current (see [Container images](#container-images)).
   - The npm page renders the README and resolves its relative links against the GitHub
     repository. While the repository is private, those links (docs, LICENSE, CONTRIBUTING) open
     only for people with access to it.
   - The comparison in [comparison.md](comparison.md) states no unmet prerequisite for the release;
     re-read it if the fingerprinting or enforceable/report-only behaviour changed since it was
     written.
2. **Bump the version.** At the repository root:
   `npm version <new-version> --no-git-tag-version`. This updates `package.json` and
   `package-lock.json`. Put the new version in the opening paragraph of each
   `skills/*/SKILL.md` ("Written for nitpicker <new-version>."); the skills test fails until they
   match. Then write the changelog entry:

   ```sh
   npm run release:changelog -- <new-version>
   ```

   `scripts/release/changelog.mts` lists the pull requests merged on `main` since the tag of the
   newest version in `CHANGELOG.md` (`--since <ref>` starts elsewhere, for example when that tag
   was never pushed), and puts each one that changes a shipped file under a new
   `## [<new-version>] - <YYYY-MM-DD>` heading as `- <title> (#<number>)`, sorted into Added
   (titles that start with Add, Support, Introduce or New), Fixed (titles that start with Fix) and
   Changed. Entries already under `Unreleased` move to the new heading and keep their place, and a
   pull request they mention is not added again. It leaves an empty `Unreleased` section above, updates the link definitions
   at the bottom (`[Unreleased]` compares the new tag with `HEAD`, and the new version links to its
   release), and prints the pull requests it left out because they change only tests, fixtures, CI,
   scripts or documentation. Edit the entry before you commit: write each line for people who use
   nitpicker, merge the pull requests that make one change, drop CI, test and refactoring changes,
   name no internal modules, move a stricter rule that can fail code that passed before under
   Changed, and add an Upgrade notes section when users need to act. Then commit it
   (`Release v<new-version>`) through a normal PR to `main`. A test fails when `package.json` has a
   version that `CHANGELOG.md` has no entry for.

3. **Test.**
   ```sh
   npm ci
   npx vitest run --config vitest.config.mts
   npm run test:installed
   ```
   Both must be green. `test:installed` packs the tarball and installs it into hoisted, nested and
   linked consumers and one on TypeScript 7, so it is the real check of the package contents. CI
   runs it too, in the `installed` job of the `typescript` workflow.
4. **Dry run.** `npm pack --dry-run` from the repository root. Confirm `LICENSE`, `README.md`,
   `CHANGELOG.md`, `package.json`, `core/`, `shared/` and `languages/` are listed, and no tests, fixtures,
   `node_modules` or reports are. Then `npm publish --dry-run`.
5. **Tag** a release commit that adds the rule pages on top of the merged commit, push the tag, move
   `latest` to it, and for a stable release move its floating tag (`v0.<minor>` before 1.0,
   `v<major>` from 1.0) to it too:
   ```sh
   git checkout --detach <commit>
   npm run gen:rules && git add --force docs/rules
   git commit -m 'Rule reference pages for v<new-version>'
   git tag v<new-version>
   git push origin v<new-version>
   git tag -f latest && git push --force origin refs/tags/latest
   git fetch --no-tags origin '+refs/tags/v0.<minor>:refs/tags/v0.<minor>'  # skip if it does not exist yet
   git merge-base --is-ancestor 'v0.<minor>^' <commit>   # must succeed: the tag only moves forward
   git tag -f v0.<minor> && git push --force origin refs/tags/v0.<minor>
   ```
6. **Publish** from the repository root:
   ```sh
   npm publish
   ```
   npm asks for a one-time password. Add `--tag next` for a pre-release. The package is unscoped,
   so no `--access` flag is needed.
7. **Verify.** In an empty directory: `npm view nitpicker version`, then
   `npm install --save-dev nitpicker typescript @types/node && npx nitpicker --help`.
8. **GitHub release.** From the tagged commit, create a release from the tag and attach the packed
   tarball so the version can be installed without npm (see
   [Install from a GitHub release](usage.md#from-a-github-release)). The notes are the version's
   `.github/release-notes/v<new-version>.md`, followed by its `CHANGELOG.md` entry with the heading and
   date, as the workflow below builds them:

   ```sh
   node core/cli.mjs changelog v<new-version> > changelog-entry.md
   rm -rf release-assets && mkdir release-assets && npm pack --pack-destination release-assets
   (cd release-assets && shasum -a 256 nitpicker-*.tgz > SHA256SUMS)
   { cat .github/release-notes/v<new-version>.md; printf '\n'; cat changelog-entry.md; } > notes.md
   gh release create v<new-version> release-assets/nitpicker-*.tgz release-assets/SHA256SUMS \
     --verify-tag --notes-file notes.md
   ```

   The first command exits 2 when the entry is missing or empty.

   Add `--prerelease` for a pre-release. A release can also go out on GitHub alone, before or
   without step 6: steps 1 to 5 still apply, and the tarball is the same file npm would publish.
   Verify it by installing the attached tarball in an empty directory as
   [Install from a GitHub release](usage.md#from-a-github-release) shows.

   The `github-release` workflow does the same from the Actions tab: run it with the full SHA of the
   release commit on `main`. It commits the rule pages on top of it and tags that commit
   `v<version>` from its `package.json`, attaches the tarball and `SHA256SUMS`, moves `latest`
   unless a newer release holds it, moves the floating tag unless `prerelease` is set or
   the version has a suffix (the step runs after the release is created, so when it fails, for
   example because the tag would move backwards or a tag ruleset of the repository blocks the
   forced push, the release stays published and the floating tag is moved by hand as in step 5),
   and takes its notes from `.github/release-notes/v<version>.md` on `main`, or from the released
   commit when `main` does not have it. It checks the `CHANGELOG.md` entry in a step of its own
   before packing, stops with an error annotation when the entry is missing or empty, and appends
   the entry to the notes. `nitpicker changelog` loads no installed package, so the workflow needs
   no `npm ci`. Write the notes without personal names: generated notes credit PR authors.

## Container images

The root `Dockerfile` has one target per image variant (`typescript`, `jvm`, `python`, `all`; see
[Container images](usage.md#container-images)). It installs the package from source with
`npm ci --omit=dev`, so the images must be built from the same commit as the tag, and base images are
pinned to exact versions. Bump them together, and keep Node, Bun, the JDK, Gradle, Python, uv and
Poetry equal to the versions CI uses (`core/container-image.test.mjs` fails when they drift, and when
the `container` workflow's matrix misses a variant). The images are `linux/amd64` only; arm64 is
tracked in [#562](https://github.com/jhonDoe15/nitpicker/issues/562).

The `container` workflow builds every variant and gates a sample project of each preset in it
(`.github/container-smoke`): a harmless change must exit 0 and a change with a known violation must
exit 1. Some cases run as the host user with a home directory mounted, some as root and some as a
user with no passwd entry (`<case>@root`, `<case>@12345:12345`). It runs on pushes to `main` that
touch the Dockerfile, the package files, `core`, `shared`, `languages` or the smoke tests, from the
Actions tab, and on a pull request when the `run-ci` label is added. It is not a required check. Only
runs on `main` and releases write the build cache; every run reads it. Run the same smoke test
locally with `.github/container-smoke/run.sh nitpicker:jvm java-gradle java-maven@12345:12345 kotlin`.

The `github-release` workflow calls `container` before it creates the release, which waits for it.
Each image job builds its variant from the released commit, runs the smoke test, and only then pushes
that same image to GitHub Container Registry (`ghcr.io/<owner>/nitpicker`, the owner in lower case)
with the job's `GITHUB_TOKEN` and `packages: write`; no secret is needed. The images carry the
version, the commit and the source repository as OCI labels, and no provenance attestation. The tags
are:

- `<version>-<variant>` for every variant, for example `0.2.0-jvm`;
- `<version>` for the TypeScript image;
- `latest-<variant>` and `latest` for a stable release (not for a pre-release), moved by a final job
  only after every variant passed and was pushed.

The first release after this change creates the package, private by default; until then no image
exists. Make it public under the package's settings, so that the images can be pulled without logging
in. If a variant fails, no release is created; fix it and run the workflow again, which pushes the
version tags again.

To publish to another registry, change `REGISTRY` and `IMAGE_NAME` in `container.yml`, replace the
`docker/login-action` credentials (a secret for Docker Hub or a cloud registry, for example) and
give the `images` job in `github-release.yml` only the permissions that registry needs. Then update
the image names in [usage.md](usage.md#container-images).

## Automation

There is no npm publish workflow, and none runs on push. The `github-release` workflow only
creates GitHub releases and pushes the container images, and only when run by hand. The first
publish is manual, because npm can only attach a trusted publisher to a package that already
exists. If publishing is later automated it must be a manual `workflow_dispatch` job that
authenticates through npm trusted publishing (OIDC) rather than a long-lived token, not a trigger on
tags or branches. npm provenance needs a
public repository, so it applies only once this one is public.
