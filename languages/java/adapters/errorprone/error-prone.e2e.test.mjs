import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';
import { readErrorProneFindings } from './java-errorprone.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

const JOBS = `package demo;

import java.util.concurrent.ExecutorService;

public final class Jobs {
  private final ExecutorService executor;

  public Jobs(ExecutorService executor) {
    this.executor = executor;
  }

  public void start() {
    executor.submit(this::count);
  }

  @SuppressWarnings("CheckReturnValue")
  public void restart() {
    count();
  }

  public int count() {
    return 1;
  }

  public String name() {
    return null;
  }
}
`;

const JOBS_CHECK = `package demo;

final class JobsCheck {
  void run(Jobs jobs) {
    jobs.count();
  }
}
`;

const BREAK_ONLY_THE_EXTRA_COMPILE = `
tasks.named('nitpickerErrorProne') {
    doFirst { file('src/main/java/demo/Broken.java').text = 'package demo; class Broken { int x = "s"; }' }
}
`;

const projects = [];

function project(extraBuild = '') {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-errorprone-e2e-')));
  projects.push(root);
  const files = {
    'settings.gradle': "rootProject.name = 'jobs'\n",
    'build.gradle': `plugins {\n    id 'java'\n}\n${extraBuild}`,
    'src/main/java/demo/Jobs.java': JOBS,
    'src/test/java/demo/JobsCheck.java': JOBS_CHECK,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

function runGradle(root, ...tasks) {
  return spawnSync(
    gradle,
    ['--console=plain', '--quiet', '--no-configuration-cache', '-I', INIT_SCRIPT, ...tasks],
    { cwd: root, encoding: 'utf8', timeout: GRADLE_STEP_TIMEOUT_MS },
  );
}

const regularClass = (root) =>
  readFileSync(path.join(root, 'build/classes/java/main/demo/Jobs.class'));

describe.skipIf(!enabled)('Error Prone through the init script', () => {
  let root;
  let regularBefore;
  let run;

  beforeAll(() => {
    root = project();
    runGradle(root, 'classes');
    regularBefore = regularClass(root);
    run = runGradle(root, 'nitpickerErrorProne');
  }, GRADLE_STEP_TIMEOUT_MS);

  afterAll(() => {
    for (const directory of projects.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('reports an ignored Future, ignored results of own methods in main and test code, and a returned null', () => {
    expect(run.status).toBe(0);
    const findings = readErrorProneFindings({
      reportRoot: path.join(root, 'build/nitpicker'),
      roots: [root],
      lintedRoots: ['src/main/java', 'src/test/java'],
    });

    expect(
      findings.map(({ tool, rule, path: file, location, message }) => [
        tool,
        rule,
        file,
        location.line,
        message,
      ]),
    ).toEqual([
      [
        'errorprone',
        'FutureReturnValueIgnored',
        'src/main/java/demo/Jobs.java',
        13,
        "Return value of methods returning Future must be checked. Ignoring returned Futures suppresses exceptions thrown from the code that completes the Future. Did you mean 'var unused = executor.submit(this::count);' or to remove this line?",
      ],
      [
        'errorprone',
        'CheckReturnValue',
        'src/main/java/demo/Jobs.java',
        18,
        "The result of `count()` must be used. Did you mean '@CanIgnoreReturnValue public int count() {' or 'var unused = count();' or to remove this line?",
      ],
      [
        'errorprone',
        'NullAway',
        'src/main/java/demo/Jobs.java',
        26,
        'returning @Nullable expression from method with @NonNull return type. Annotate what may be null with @Nullable (org.jspecify.annotations.Nullable) and check it before use; otherwise give it a non-null value.',
      ],
      [
        'errorprone',
        'CheckReturnValue',
        'src/test/java/demo/JobsCheck.java',
        5,
        "The result of `count()` must be used. Did you mean 'var unused = jobs.count();' or to remove this line?",
      ],
    ]);
  });

  it('compiles into its own directory and leaves the regular compile alone', () => {
    expect(
      existsSync(path.join(root, 'build/nitpicker/errorprone/classes/main/demo/Jobs.class')),
    ).toBe(true);
    expect(regularClass(root).equals(regularBefore)).toBe(true);
  });

  it(
    'fails the build, with no report, when its own compile fails',
    () => {
      const broken = project(BREAK_ONLY_THE_EXTRA_COMPILE);
      const result = runGradle(broken, 'nitpickerErrorProne');
      const cause = /Error Prone could not compile the sources: (.*)$/m.exec(result.stderr)?.[1];

      expect(result.status).toBe(1);
      expect(cause).toBe(
        `${path.join(broken, 'src/main/java/demo/Broken.java')}:1: incompatible types: java.lang.String cannot be converted to int`,
      );
      expect(existsSync(path.join(broken, 'build/nitpicker/errorprone.json'))).toBe(false);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
