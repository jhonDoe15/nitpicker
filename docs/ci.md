# nitpicker in CI

nitpicker compares a change with its merge base, so a CI job needs four things whatever the CI
system:

1. **History that contains the merge base.** A shallow checkout cannot find where the branch
   started. Fetch the full history (`fetch-depth: 0`, `GIT_DEPTH: 0`) or at least the target
   branch.
2. **The target branch.** nitpicker reads it from `GITHUB_BASE_REF` (GitHub Actions),
   `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` (GitLab CI), `CHANGE_TARGET` (Jenkins multibranch),
   `SYSTEM_PULLREQUEST_TARGETBRANCH` (Azure Pipelines), `BITBUCKET_PR_DESTINATION_BRANCH`
   (Bitbucket Pipelines) and `BUILDKITE_PULL_REQUEST_BASE_BRANCH` (Buildkite), and compares with
   `origin/<target>`. That remote-tracking branch has to exist in the checkout; a message such as
   `Cannot resolve base ref "origin/main". Run git fetch ...` names the fetch that is missing.
   `--base <ref>` overrides all of them.
3. **The project's dependencies installed**, the way you install them for the build. nitpicker
   runs from the project's own `node_modules` (`npm install --save-dev nitpicker`), so the
   version in CI is the one in your lockfile. A Java, Kotlin or Python project needs the toolchain
   of its [preset](#toolchains-by-preset) as well.
4. **The exit code.** 0 passed, 1 new enforceable findings, 2 a tool error or a failure to decide.
   See [Exit codes](usage.md#exit-codes).

Optional but worth having: a cache for the base side (the base is measured once per merge base;
see [Findings cache](usage.md#findings-cache)), and the policy-acceptance variable below.

**Accepting a loosening of `nitpicker.config.json`.** A change that loosens the policy fails with a
`nitpicker-config/policy-loosened` finding that names a digest. A person who agrees sets
`NITPICKER_ACCEPT_POLICY_CHANGE` to that digest, and the job is run again. The variable is honoured
only when `CI` is set, and never by a coding agent: map it from a variable that only an admin can
change (a GitHub repository variable, a protected GitLab CI/CD variable, a Jenkins credential or
parameter that only admins edit), and never write a digest into the pipeline file.

## GitHub Actions

### With the action

```yaml
name: nitpicker
on:
  pull_request:
jobs:
  nitpicker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7.0.1
        with:
          fetch-depth: 0
      - uses: jhonDoe15/nitpicker@main
        with:
          accept-policy-change: ${{ vars.NITPICKER_ACCEPT_POLICY_CHANGE }}
```

Pin the action to a release tag or a commit once there is one; `main` is the development line.
The action sets up Node.js, installs the project's dependencies, makes sure the merge base exists,
restores and saves the findings cache, runs `npx nitpicker` from the project (its own
devDependency), writes the job summary and annotations, uploads the report when the gate fails,
and fails the job with the gate's exit code. The sample workflow
[`.github/workflows/github-action.yml`](../.github/workflows/github-action.yml) runs it on
[a sample project](../.github/sample-project) with a seeded finding.

| Input                  | Default                | What it does                                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `working-directory`    | `.`                    | The project folder, relative to the repository root, for a project in a subfolder. Annotations and links carry the folder, so they land on the right files.                                                                                                                                            |
| `base-ref`             |                        | Passed as `--base`. Empty uses the pull request target branch, then the repository default branch.                                                                                                                                                                                                     |
| `arguments`            |                        | Extra nitpicker arguments, split on spaces without quoting, for example `--analyzer eslint-lint`. Do not pass `--output` here; use `report-directory`.                                                                                                                                                 |
| `package`              |                        | Run this package with `npx` (for example `nitpicker@<version>`) instead of the project's own. Needed for a project without a `package.json`.                                                                                                                                                           |
| `node-version`         | `24`                   | The Node.js to set up (22.14 or newer). Empty keeps the runner's Node.js.                                                                                                                                                                                                                              |
| `install-command`      |                        | Empty installs with npm, pnpm or Yarn from the nearest lockfile (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`). `none` skips it; anything else runs as a shell command in the working directory. A Bun project sets up Bun first and passes `bun install --frozen-lockfile`. |
| `cache`                | `true`                 | Restore and save the findings cache with `actions/cache`, keyed by the merge base and `nitpicker.config.json`. It lives in `node_modules/.cache/nitpicker`, or in the `.git` folder when the project has no `node_modules`.                                                                            |
| `cache-url`            |                        | A remote cache (`NITPICKER_CACHE_URL`) that runs read and `cache-publish` writes.                                                                                                                                                                                                                      |
| `cache-auth-header`    |                        | The `Authorization` value for the remote cache (`NITPICKER_CACHE_AUTH_HEADER`). Pass a secret, with write access only on the default branch.                                                                                                                                                           |
| `cache-publish`        | `true`                 | On a push to the default branch, run `nitpicker cache publish` (needs `cache-url`) so later branches reuse the default branch's findings. The comparison is skipped there: the head is the base.                                                                                                       |
| `accept-policy-change` |                        | `NITPICKER_ACCEPT_POLICY_CHANGE`; map the repository variable, as above.                                                                                                                                                                                                                               |
| `report-directory`     | `reports/quality/diff` | Where the reports are written, relative to the working directory.                                                                                                                                                                                                                                      |
| `upload-sarif`         | `false`                | Upload `report.sarif` to code scanning. The job needs `permissions: security-events: write`; a failed upload only warns.                                                                                                                                                                               |
| `sarif-category`       | `nitpicker`            | The code scanning category. Use one per project when several projects upload.                                                                                                                                                                                                                          |
| `upload-report`        | `true`                 | Upload the report directory as an artifact when the gate fails.                                                                                                                                                                                                                                        |
| `artifact-name`        | `nitpicker-report`     | The artifact name. Use another when a job runs the action more than once.                                                                                                                                                                                                                              |

Outputs: `exit-code` (empty when the gate did not run), `report-directory` (absolute path) and
`skipped` (`true` on a push to the default branch).

The action does not check out the repository (a workflow has to for `uses:` to find it) and does
not install a JDK or Python. Use `fetch-depth: 0` in `actions/checkout`. With a shallow checkout the
action fetches the target branch in full before it compares, and fails with a message that names
`fetch-depth: 0` when there is still no merge base.

Publish the default branch's findings so that every pull request starts from a warm base:

```yaml
on:
  push:
    branches: [main]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: jhonDoe15/nitpicker@main
        with:
          cache-url: https://cache.example.com/nitpicker
          cache-auth-header: ${{ secrets.NITPICKER_CACHE_WRITE_AUTH }}
```

A project in a subfolder, uploading to code scanning:

```yaml
permissions:
  contents: read
  security-events: write
steps:
  - uses: actions/checkout@v7.0.1
    with:
      fetch-depth: 0
  - uses: jhonDoe15/nitpicker@main
    with:
      working-directory: services/api
      upload-sarif: true
      sarif-category: nitpicker-api
      artifact-name: nitpicker-report-api
```

### Without the action

```yaml
jobs:
  nitpicker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7.0.1
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7.1.0
        with:
          node-version: 24
      - run: npm ci
      - uses: actions/cache@v6.1.0
        with:
          path: node_modules/.cache/nitpicker
          key: nitpicker-${{ runner.os }}-${{ github.event.pull_request.base.sha }}
          restore-keys: nitpicker-${{ runner.os }}-
      - run: npx nitpicker --output reports/nitpicker
        env:
          NITPICKER_ACCEPT_POLICY_CHANGE: ${{ vars.NITPICKER_ACCEPT_POLICY_CHANGE }}
      - uses: actions/upload-artifact@v7.0.2
        if: failure()
        with:
          name: nitpicker-report
          path: reports/nitpicker
```

`GITHUB_BASE_REF` gives the base, and the job summary and annotations below need no extra step.
To upload the SARIF, add `github/codeql-action/upload-sarif@v4.39.1` with
`sarif_file: reports/nitpicker/report.sarif` after the run, with `if: always()` and the
`security-events: write` permission. Without a JDK or Python step the Java, Kotlin and Python
presets cannot run; see the next section. The [container image](usage.md#container-image) runs the
gate without a Node.js setup, for TypeScript and JavaScript projects.

### Job summary and annotations

On GitHub Actions the command line writes both itself, with or without the action:

- **Job summary.** When `GITHUB_STEP_SUMMARY` is set, a Markdown summary is appended: the new
  findings by tool and rule, the first 25 new enforceable findings with a link to the file and line,
  the policy changes (with the digest to accept for a loosening), tool errors, notices, and the
  route for a finding that is wrong (an `exceptions` entry). A project in a subfolder is named in
  the heading.
- **Annotations.** When `GITHUB_ACTIONS` is `true`, each new enforceable finding becomes an
  `::error file=...,line=...,title=<tool>/<rule>::<message>` annotation on its line, with the
  characters the workflow-command format reserves escaped. GitHub shows at most 10 error
  annotations per step, so the command line writes at most 10 (tool errors take up to two of them)
  and adds a `::notice` that counts the rest; the job summary and the report files list them all.
- `--all` writes the same for the full run. Shard workers (`--shard-count`) write nothing, since
  their report is partial; `nitpicker aggregate` writes it for the combined result.
- `NITPICKER_GITHUB_OUTPUT=off` turns both off and `NITPICKER_GITHUB_OUTPUT=on` writes the
  annotations outside GitHub Actions (the summary still needs `GITHUB_STEP_SUMMARY`). A summary that
  cannot be written is a warning on stderr and never changes the exit code.

## GitLab CI

A merge request pipeline sets `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`, which nitpicker reads. Clone
the full history, make sure the target branch exists as `origin/<target>`, and cache the findings
by the merge request's base commit:

```yaml
nitpicker:
  image: node:24
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  variables:
    GIT_DEPTH: '0'
  cache:
    key: nitpicker-$CI_MERGE_REQUEST_DIFF_BASE_SHA
    paths:
      - node_modules/.cache/nitpicker
  before_script:
    - git fetch origin "+refs/heads/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME:refs/remotes/origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
    - npm ci
  script:
    - npx nitpicker --output reports/nitpicker
  artifacts:
    when: always
    paths:
      - reports/nitpicker
    reports:
      junit: reports/nitpicker/report.junit.xml
```

- `GIT_DEPTH: '0'` clones the full history. Without it GitLab makes a shallow clone of the merge
  request's branch only, so there is no `origin/<target>` and no merge base; nitpicker then says `Cannot resolve base ref "origin/<target>". Run git fetch --unshallow ...`.
- Set `NITPICKER_ACCEPT_POLICY_CHANGE` as a CI/CD variable of the project that only maintainers can
  edit (protected, or limited to the Maintainer role); the job sees it as an environment variable.
  Leave it unset otherwise.
- The JUnit report shows the failures in the merge request's Tests tab. GitLab's Code Quality
  report needs the Code Climate format and its SAST report GitLab's own format, which nitpicker does
  not write; keep `report.sarif` in the artifacts for tools that read SARIF.
- A pipeline that is not a merge request pipeline (a branch pipeline) falls back to the `base` of
  `nitpicker.config.json`, then `origin/HEAD`, then `origin/main`.

Publish the default branch's findings to a remote cache, so merge requests find their base ready:

```yaml
nitpicker-publish:
  image: node:24
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  variables:
    NITPICKER_CACHE_URL: https://cache.example.com/nitpicker
    NITPICKER_CACHE_AUTH_HEADER: $NITPICKER_CACHE_WRITE_AUTH
  script:
    - npm ci
    - npx nitpicker cache publish
```

## Jenkins

A multibranch pipeline builds a pull request with `CHANGE_TARGET` set. Check out the full history
(turn off shallow clone) and fetch the target branch:

```groovy
pipeline {
  agent { docker { image 'node:24' } }
  stages {
    stage('nitpicker') {
      when { changeRequest() }
      steps {
        checkout([
          $class: 'GitSCM',
          branches: scm.branches,
          userRemoteConfigs: scm.userRemoteConfigs,
          extensions: scm.extensions + [[$class: 'CloneOption', shallow: false, noTags: true]]
        ])
        withCredentials([gitUsernamePassword(credentialsId: 'git-credentials')]) {
          sh 'git fetch origin "+refs/heads/$CHANGE_TARGET:refs/remotes/origin/$CHANGE_TARGET"'
        }
        sh 'npm ci'
        withEnv(["NITPICKER_ACCEPT_POLICY_CHANGE=${params.ACCEPT_POLICY_CHANGE ?: ''}"]) {
          sh 'npx nitpicker --output reports/nitpicker'
        }
      }
      post {
        always {
          junit 'reports/nitpicker/report.junit.xml'
          archiveArtifacts artifacts: 'reports/nitpicker/**', allowEmptyArchive: true
        }
      }
    }
  }
}
```

- `git-credentials` is the credential the branch source uses; drop `withCredentials` when the
  agent can fetch without one. A branch source that already fetches the target branch
  (`origin/<CHANGE_TARGET>` exists) needs neither the credential nor the fetch.
- Restrict who can set `ACCEPT_POLICY_CHANGE` (a build parameter only admins can change), since it
  lets a change through that loosens the policy. Leave it empty otherwise.
- Cache `node_modules/.cache/nitpicker` with the Job Cacher plugin, or point `NITPICKER_CACHE_DIR`
  at a directory that persists on the agent, keyed by `CHANGE_TARGET`'s commit.
- A build of a plain branch (no `CHANGE_TARGET`) uses the `base` of `nitpicker.config.json`, then
  `origin/HEAD`, then `origin/main`.

## Other CI systems

Azure Pipelines (`SYSTEM_PULLREQUEST_TARGETBRANCH`, a `refs/heads/...` name that nitpicker
shortens; set `fetchDepth: 0` on the checkout step), Bitbucket Pipelines
(`BITBUCKET_PR_DESTINATION_BRANCH`; `clone: depth: full`) and Buildkite
(`BUILDKITE_PULL_REQUEST_BASE_BRANCH`) work the same way. Elsewhere, pass `--base origin/<target>`.

## Toolchains by preset

The runner needs Node.js 22.14 or newer for every preset, plus what the preset runs:

| Preset                                      | Also needed in the job                                                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript` (React included), `javascript` | The project's dependencies (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`, `bun install --frozen-lockfile`); `typescript` and the test runner come from the project.                             |
| `java` (Gradle)                             | JDK 21 (`actions/setup-java` with `distribution: temurin`, `java-version: 21`; `eclipse-temurin:21` on GitLab). The project's `gradlew`, or `gradle` on the `PATH` (`gradle/actions/setup-gradle@v6.4.0`).                |
| `java` (Maven)                              | JDK 21 and the project's `mvnw`, or Maven 3.6.3 or newer on the `PATH` (`actions/setup-java` with `cache: maven`).                                                                                                        |
| `kotlin`                                    | As Java with Gradle (a Maven build uses the `java` preset).                                                                                                                                                               |
| `python`                                    | Python 3.10 or newer and the project's environment created before the run: `uv sync` with `astral-sh/setup-uv@v7.6.0`, or `poetry install`, `pipenv install`, `pip install -r requirements.txt` in a virtual environment. |

A Java, Kotlin or Python project has no `package.json`, so run nitpicker with the action's
`package` input (or `npx nitpicker@<version>`; a version that is not on npm takes the URL of the
[release tarball](usage.md#from-a-github-release)), and give the job Node.js next to the JDK or
Python. On GitHub Actions the steps before the action are:

```yaml
- uses: actions/checkout@v7.0.1
  with:
    fetch-depth: 0
- uses: actions/setup-java@v6.1.0
  with:
    distribution: temurin
    java-version: 21
- uses: gradle/actions/setup-gradle@v6.4.0
- uses: jhonDoe15/nitpicker@main
  with:
    package: nitpicker@<version>
```

and, for Python:

```yaml
- uses: actions/checkout@v7.0.1
  with:
    fetch-depth: 0
- uses: actions/setup-python@v7.1.0
  with:
    python-version: '3.12'
- uses: astral-sh/setup-uv@v7.6.0
- run: uv sync
- uses: jhonDoe15/nitpicker@main
  with:
    package: nitpicker@<version>
```

In GitLab CI use an image that has both toolchains (for example `eclipse-temurin:21-jdk` or
`python:3.12` with Node.js 24 installed from NodeSource) and run `./gradlew --version` or `uv sync`
in `before_script`. In Jenkins use an agent with the same tools.
