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
   `npm install --save-dev nitpicker vitest @vitest/coverage-v8 typescript && npx nitpicker --help`.
8. **GitHub release.** Create a release from the tag with the changes since the previous tag.

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

There is no publish workflow, and none runs on push. The first publish is manual, because npm can
only attach a trusted publisher to a package that already exists. If publishing is later automated
it must be a manual `workflow_dispatch` job that authenticates through npm trusted publishing
(OIDC) rather than a long-lived token, not a trigger on tags or branches. npm provenance needs a
public repository, so it applies only once this one is public.
