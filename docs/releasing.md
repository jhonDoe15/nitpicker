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
  carries no language prefix. The tag must equal `package.json` `version` and point at a commit on
  `main`. Tags are created only at release time, never ahead of it.
- Pre-releases use a suffix (`v0.2.0-rc.1`) and are published with
  `npm publish --tag next`.

## Checklist

Work from a clean checkout of `main` with full history.

1. **Prerequisites.**
   - Everything intended for the release is merged to `main` and CI (`typescript` workflow) is green.
   - Node.js 22.14 or newer (the `engines` floor) and an npm account with publish rights on
     `nitpicker` and two-factor authentication on (npm requires it to publish). Run `npm whoami`.
     The first publish creates the package, so it needs no prior rights.
   - `LICENSE` is at the repository root, which is also the package root, so npm packs it as is.
     The installed-package test asserts the packed copy matches the root file.
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
   `package-lock.json`. Commit it (`Release v<new-version>`) through a normal PR to `main`.
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
   `package.json`, `core/`, `shared/` and `languages/` are listed, and no tests, fixtures,
   `node_modules` or reports are. Then `npm publish --dry-run`.
5. **Tag** the merged release commit and push the tag:
   ```sh
   git tag v<new-version> <commit>
   git push origin v<new-version>
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
   attaches the tarball and `SHA256SUMS`, and takes its notes from
   `.github/release-notes/v<version>.md`, which must be on `main` first. Write the notes without
   personal names: generated notes credit PR authors.

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
