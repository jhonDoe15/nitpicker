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
   `--base <ref>` overrides all of them, and `npx nitpicker base` prints the base a run would use,
   so a script can fetch it first.
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
only when `CI` is set, and never by a coding agent. GitHub Actions, GitLab CI, Bitbucket Pipelines
and Buildkite set `CI`; Jenkins and Azure Pipelines do not, so their recipes set `CI=true`. Map the
variable from one that only an admin can change (a GitHub repository variable, a protected GitLab
CI/CD variable, a Jenkins parameter of a job only admins can build with parameters), and never
write a digest into the pipeline file.

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
      - uses: jhonDoe15/nitpicker@v0.1
        with:
          accept-policy-change: ${{ vars.NITPICKER_ACCEPT_POLICY_CHANGE }}
```

`v0.1` is a floating tag that moves to each stable 0.1.x release (see
[Versioning and tags](releasing.md#versioning-and-tags)); it exists from the first stable release.
For stability, pin a full commit SHA instead (`jhonDoe15/nitpicker@<40-character sha>`) and let
Dependabot or Renovate move it.

The action sets up Node.js, installs the project's dependencies, fetches the base and makes sure
the merge base exists, restores and saves the findings cache, runs `npx nitpicker` from the
project (its own devDependency), writes the job summary and annotations, uploads the report when
the gate fails, and fails the job with the gate's exit code. On a push or a manual run it compares
with the repository default branch, and in a merge queue with the queue's target branch. The
sample workflow [`.github/workflows/github-action.yml`](../.github/workflows/github-action.yml)
runs it on [a sample project](../.github/sample-project) with a seeded finding, and on a project
without a `package.json`.

<!-- generated:action-inputs begin (npm run gen:checks) -->

Inputs:

- `working-directory` (default `.`): The project folder, relative to the repository root, for a
  project in a subfolder. Annotations, links and report paths carry the folder, so they land on the
  right files.
- `base-ref` (empty by default): The ref to compare against, passed as `--base`, for example
  `origin/release`. Empty takes the base the way nitpicker picks it (the pull request or merge queue
  target branch, then `base` in `nitpicker.config.json`, then the repository default branch). The
  action fetches the base and keys the cache on its merge base with `HEAD`.
- `arguments` (empty by default): Extra nitpicker arguments, one per line or separated by spaces (no
  quoting), for example `--analyzer eslint-lint`. `--output` and `--base` are refused: use
  `report-directory` and `base-ref`.
- `package` (empty by default): A package to run with `npx` instead of the project's own nitpicker,
  for example `nitpicker@<version>`, the URL of a release tarball or the path of one. A project
  without a `package.json` (Java, Kotlin or Python) needs it. Empty runs the project's
  devDependency, so the version is the one in its lockfile.
- `node-version` (default `24`): The Node.js version to set up (22.14 or newer). Empty keeps the
  Node.js of the runner.
- `install-command` (empty by default): How to install the project's dependencies. Empty finds the
  nearest lockfile up to the repository root and runs `npm ci`, `pnpm install --frozen-lockfile`,
  `yarn install --immutable` (`--frozen-lockfile` for Yarn 1) or `bun install --frozen-lockfile` in
  its folder; set up Bun before the action for a Bun project. `none` skips the install, and anything
  else runs as a shell command in the working directory.
- `cache` (default `true`): Restore and save the findings cache with `actions/cache`, keyed by the
  merge base and `nitpicker.config.json`, also when the gate fails. It lives in
  `node_modules/.cache/nitpicker`, or in the `.git` folder for a project without `node_modules`.
- `cache-url` (empty by default): A remote cache prefix (`NITPICKER_CACHE_URL`). Runs read it, and
  `cache-publish` writes to it.
- `cache-auth-header` (empty by default): The `Authorization` header value for the remote cache
  (`NITPICKER_CACHE_AUTH_HEADER`). Pass a secret, and give write access only to the default branch.
- `cache-publish` (default `true`): On a push to the default branch, run `nitpicker cache publish`
  so later branches reuse its findings as their base. Needs `cache-url`. The comparison is skipped
  there, since the head is the base.
- `accept-policy-change` (empty by default): The `NITPICKER_ACCEPT_POLICY_CHANGE` digest that
  accepts a loosening of `nitpicker.config.json`. Map the repository variable
  `vars.NITPICKER_ACCEPT_POLICY_CHANGE`, which only an admin can set; never write a digest into a
  workflow.
- `report-directory` (default `reports/quality/diff`): Where the reports are written, relative to
  `working-directory`.
- `upload-sarif` (default `false`): Upload `report.sarif` to code scanning. The job needs the
  `security-events: write` permission; a failed upload only warns.
- `sarif-category` (default `nitpicker`): The code scanning category of the upload. Use one per
  project when several projects upload.
- `upload-report` (default `true`): Upload the report directory as an artifact when the gate fails.
- `artifact-name` (default `nitpicker-report`): The artifact name of the report. Use another name
  when a job runs the action more than once.

Outputs:

- `exit-code`: The exit code of the gate: 0 passed, 1 new enforceable findings, 2 a tool error or a
  failure to decide. Empty when the gate did not run.
- `report-directory`: The absolute path of the report directory.
- `skipped`: `true` on a push to the default branch, where the head is the base and there is nothing
  to compare.

<!-- generated:action-inputs end -->

The action does not check out the repository: the gate reads the code and its history from the
checkout, so put `actions/checkout` with `fetch-depth: 0` before it. With a shallow checkout the
action fetches the base in full before it compares, and fails with a message that names
`fetch-depth: 0` when there is still no merge base. It does not install a JDK or Python either
(see [Toolchains by preset](#toolchains-by-preset)).

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
      - uses: jhonDoe15/nitpicker@v0.1
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
  - uses: jhonDoe15/nitpicker@v0.1
    with:
      working-directory: services/api
      upload-sarif: true
      sarif-category: nitpicker-api
      artifact-name: nitpicker-report-api
```

The annotations, the job summary, `report.sarif` and `codequality.json` name files from the
repository root, so the results of a project in a subfolder land on the right files (see
[SARIF](usage.md#sarif)).

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
      - id: base
        run: echo "sha=$(git merge-base HEAD "origin/$GITHUB_BASE_REF")" >> "$GITHUB_OUTPUT"
      - id: cache
        uses: actions/cache/restore@v6.1.0
        with:
          path: node_modules/.cache/nitpicker
          key: nitpicker-${{ runner.os }}-${{ steps.base.outputs.sha }}-${{ hashFiles('nitpicker.config.json') }}
      - run: npx nitpicker --output reports/nitpicker
        env:
          NITPICKER_ACCEPT_POLICY_CHANGE: ${{ vars.NITPICKER_ACCEPT_POLICY_CHANGE }}
      - uses: actions/cache/save@v6.1.0
        if: ${{ !cancelled() && steps.cache.outputs.cache-hit != 'true' }}
        with:
          path: node_modules/.cache/nitpicker
          key: ${{ steps.cache.outputs.cache-primary-key }}
      - uses: actions/upload-artifact@v7.0.2
        if: failure()
        with:
          name: nitpicker-report
          path: reports/nitpicker
```

`GITHUB_BASE_REF` gives the base, and the job summary and annotations below need no extra step.
The cache is restored after `npm ci`, which empties `node_modules`, and saved with
`actions/cache/save` under `!cancelled()`, because `actions/cache` saves only when the job passes
and a failing gate has measured the base too. To upload the SARIF, add
`github/codeql-action/upload-sarif@v4.39.1` with `sarif_file: reports/nitpicker/report.sarif`
after the run, with `if: ${{ !cancelled() }}` and the `security-events: write` permission. The
[container image](usage.md#container-image) runs the gate without a Node.js setup, for TypeScript
and JavaScript projects.

### Job summary and annotations

On GitHub Actions the command line writes both itself, with or without the action:

- **Job summary.** When `GITHUB_STEP_SUMMARY` is set, a Markdown summary is appended: the new
  findings by tool and rule, the first 25 new enforceable findings with a link to the file and line,
  the policy changes (with the digest to accept for a loosening), the first 10 tool errors,
  notices, and the route for a finding that is wrong (an `exceptions` entry). Every list ends with
  the number it leaves out, and the summary is cut to stay under GitHub's 1 MiB limit. A project in
  a subfolder is named in the heading.
- **Annotations.** When `GITHUB_ACTIONS` is `true`, each new enforceable finding becomes an
  `::error file=...,line=...,title=<tool>/<rule>::<message>` annotation on its line, with the
  characters the workflow-command format reserves escaped. GitHub shows at most 10 error
  annotations per step, so the command line writes at most 10 (tool errors take up to 2 of them)
  and adds a `::notice` that counts the rest; the job summary and the report files list them all.
- `--all` writes the same for the full run. Shard workers (`--shard-count`) write nothing, since
  their report is partial; `nitpicker aggregate` writes it for the combined result.
- `NITPICKER_GITHUB_OUTPUT=off` turns both off and `NITPICKER_GITHUB_OUTPUT=on` writes the
  annotations outside GitHub Actions (the summary still needs `GITHUB_STEP_SUMMARY`). A summary that
  cannot be written is a warning on stderr and never changes the exit code.

## GitLab CI

A merge request pipeline sets `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`, which nitpicker reads. Clone
the full history, make sure the target branch exists as `origin/<target>`, and cache the findings
by the merge request's merge base:

```yaml
nitpicker:
  image: node:24
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  variables:
    GIT_DEPTH: '0'
    NITPICKER_CACHE_DIR: $CI_PROJECT_DIR/.nitpicker-cache
  cache:
    key: nitpicker-$CI_MERGE_REQUEST_DIFF_BASE_SHA
    paths:
      - .nitpicker-cache
    when: always
  before_script:
    - echo .nitpicker-cache/ >> .git/info/exclude
    - target="$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
    - git fetch origin "+refs/heads/$target:refs/remotes/origin/$target"
    - npm ci
  script:
    - npx nitpicker --output reports/nitpicker
  artifacts:
    when: always
    paths:
      - reports/nitpicker
    reports:
      junit: reports/nitpicker/report.junit.xml
      codequality: reports/nitpicker/codequality.json
```

- `GIT_DEPTH: '0'` clones the full history. Without it GitLab makes a shallow clone of the merge
  request's branch only, so there is no `origin/<target>` and no merge base; nitpicker then says
  `Cannot resolve base ref "origin/<target>". Run git fetch --unshallow ...`.
- The cache lives outside `node_modules`, which `npm ci` deletes, and inside the project folder,
  where GitLab caches; `.git/info/exclude` keeps it out of the change nitpicker checks.
  `when: always` saves it when the gate fails too, since GitLab saves a cache only for a passing
  job by default.
- Set `NITPICKER_ACCEPT_POLICY_CHANGE` as a CI/CD variable of the project that only maintainers can
  edit (protected, or limited to the Maintainer role); the job sees it as an environment variable.
  Leave it unset otherwise.
- The JUnit report shows the failures in the merge request's Tests tab, and `codequality.json`
  (the GitLab Code Quality format, with paths from the repository root) shows each new finding in
  the merge request's Code Quality widget and on its line in the diff. Keep `report.sarif` in the
  artifacts for tools that read SARIF.
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
  agent {
    docker {
      image 'node:24'
      args '-e HOME=/tmp'
    }
  }
  parameters {
    string(name: 'ACCEPT_POLICY_CHANGE', defaultValue: '', description: 'nitpicker policy digest')
  }
  environment {
    CI = 'true'
    NITPICKER_ACCEPT_POLICY_CHANGE = "${params.ACCEPT_POLICY_CHANGE ?: ''}"
  }
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
        sh 'npx nitpicker --output reports/nitpicker'
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

- Jenkins does not set `CI`, and nitpicker honours `NITPICKER_ACCEPT_POLICY_CHANGE` only when it
  is set, hence `CI = 'true'`.
- The Docker agent runs the steps as the Jenkins user, which has no home folder in the image;
  `HOME=/tmp` gives npm and git a writable one. Drop it on an agent that has a home folder.
- `git-credentials` is the credential the branch source uses; drop `withCredentials` when the
  agent can fetch without one. A branch source that already fetches the target branch
  (`origin/<CHANGE_TARGET>` exists) needs neither the credential nor the fetch.
- Whoever can build the job with parameters can set `ACCEPT_POLICY_CHANGE`, which lets a change
  through that loosens the policy: give that permission to admins only. Leave it empty otherwise.
- Point `NITPICKER_CACHE_DIR` at a folder that persists on the agent (or cache one with the Job
  Cacher plugin), outside `node_modules`, which `npm ci` deletes, and outside the checkout unless
  it is ignored there.
- A build of a plain branch (no `CHANGE_TARGET`) uses the `base` of `nitpicker.config.json`, then
  `origin/HEAD`, then `origin/main`.

## Other CI systems

Azure Pipelines (`SYSTEM_PULLREQUEST_TARGETBRANCH`, a `refs/heads/...` name that nitpicker
shortens; set `fetchDepth: 0` on the checkout step, and `CI: 'true'` in the pipeline's variables,
since Azure does not set it), Bitbucket Pipelines (`BITBUCKET_PR_DESTINATION_BRANCH`;
`clone: depth: full`) and Buildkite (`BUILDKITE_PULL_REQUEST_BASE_BRANCH`) work the same way.
Elsewhere, pass `--base origin/<target>`.

## Toolchains by preset

The runner needs Node.js 22.14 or newer for every preset, plus what the preset runs:

- `typescript` (React included) and `javascript`: the project's dependencies (`npm ci`,
  `pnpm install --frozen-lockfile`, `yarn install --immutable`, `bun install --frozen-lockfile`);
  `typescript` and the test runner come from the project.
- `java` with Gradle: JDK 21 (`actions/setup-java` with `distribution: temurin` and
  `java-version: 21`; `eclipse-temurin:21` on GitLab) and the project's `gradlew`, or `gradle` on
  the `PATH` (`gradle/actions/setup-gradle@v6.4.0`).
- `java` with Maven: JDK 21 and the project's `mvnw`, or Maven 3.6.3 or newer on the `PATH`
  (`actions/setup-java` with `cache: maven`).
- `kotlin`: as Java with Gradle (a Maven build uses the `java` preset).
- `python`: Python 3.10 or newer and the project's environment created before the run, with its
  development dependencies: `uv sync` with `astral-sh/setup-uv@v7.6.0`, or `poetry install`,
  `pipenv install --dev`, or `pip install -r requirements.txt` in a virtual environment.

A Java, Kotlin or Python project has no `package.json`, so run nitpicker with the action's
`package` input (or `npx nitpicker@<version>`; a version that is not on npm takes the URL of the
[release tarball](usage.md#from-a-github-release)). The action still sets up Node.js. On GitHub
Actions the steps before the action are, for Gradle:

```yaml
- uses: actions/checkout@v7.0.1
  with:
    fetch-depth: 0
- uses: actions/setup-java@v6.1.0
  with:
    distribution: temurin
    java-version: 21
- uses: gradle/actions/setup-gradle@v6.4.0
- uses: jhonDoe15/nitpicker@v0.1
  with:
    package: nitpicker@<version>
```

for Maven:

```yaml
- uses: actions/checkout@v7.0.1
  with:
    fetch-depth: 0
- uses: actions/setup-java@v6.1.0
  with:
    distribution: temurin
    java-version: 21
    cache: maven
- uses: jhonDoe15/nitpicker@v0.1
  with:
    package: nitpicker@<version>
```

and for Python:

```yaml
- uses: actions/checkout@v7.0.1
  with:
    fetch-depth: 0
- uses: actions/setup-python@v7.1.0
  with:
    python-version: '3.12'
- uses: astral-sh/setup-uv@v7.6.0
- run: uv sync
- uses: jhonDoe15/nitpicker@v0.1
  with:
    package: nitpicker@<version>
```

In GitLab CI use an image that has both toolchains (for example `eclipse-temurin:21-jdk` or
`python:3.12` with Node.js 24 installed from NodeSource) and run `./gradlew --version`,
`./mvnw --version` or `uv sync` in `before_script`. In Jenkins use an agent with the same tools.
