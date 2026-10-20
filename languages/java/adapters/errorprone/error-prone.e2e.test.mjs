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
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { GRADLE_DIRECTORY, INIT_SCRIPT } from '../../builds/java-build.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';
import { applyRuleMessages } from '../../messages/rule-messages.mjs';
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

import demo.samples.Samples;

final class JobsCheck {
  void run(Jobs jobs) {
    jobs.count();
    Samples.make();
    new Jobs(null).start();
  }
}
`;

const SAMPLES = `package demo.samples;

public final class Samples {
  private Samples() {}

  public static int make() {
    return 1;
  }
}
`;

const WIRED = `package demo;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;

public class Wired {
  @Autowired private Jobs jobs;

  @Value("\${jobs.name}")
  private String name;

  public String describe() {
    return name + jobs.count();
  }
}
`;

const OWNER = `package demo;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Owner {
  @Id private Long id;
  private String name;

  public Long getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String nickname() {
    return null;
  }
}
`;

const BEAN = `package demo;

public class Bean {
  private String name;

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }
}
`;

const APPLICATION = `package demo;

import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
  public static void main(String[] args) {
    System.setProperty("demo", "on");
  }
}
`;

const CONFIGURATION = `package demo;

import org.springframework.context.annotation.Configuration;

@Configuration
public class Beans {
  @org.springframework.context.annotation.Bean
  static StringBuilder builder() {
    return new StringBuilder();
  }

  static final class Sizes {
    static int empty() {
      return 0;
    }
  }
}
`;

const NAMES = `package demo;

import java.util.Locale;

public class Names {
  public static String upper(String name) {
    return name.toUpperCase(Locale.ROOT);
  }
}
`;

const DEPENDENCIES = `
repositories { mavenCentral() }
dependencies {
    compileOnly 'org.springframework.boot:spring-boot-autoconfigure:3.5.5'
    compileOnly 'org.springframework:spring-context:6.2.10'
    compileOnly 'jakarta.persistence:jakarta.persistence-api:3.1.0'
}
`;

const BREAK_ONLY_THE_EXTRA_COMPILE = `
tasks.named('nitpickerErrorProne') {
    doFirst { file('src/main/java/demo/Broken.java').text = 'package demo; class Broken { int x = "s"; }' }
}
`;

const LEVEL_FORMS = [
  [
    '--enable-preview with --release',
    `tasks.withType(JavaCompile).configureEach {
    options.release = JavaVersion.current().majorVersion as int
    options.compilerArgs += ['--enable-preview']
}
`,
    {},
  ],
  [
    'an --add-exports of a JDK module',
    `tasks.withType(JavaCompile).configureEach {
    options.compilerArgs += ['--add-exports', 'java.base/sun.nio.ch=ALL-UNNAMED']
}
`,
    {
      'src/main/java/demo/Buffers.java': `package demo;

final class Buffers {
  static boolean direct(Object buffer) {
    return buffer instanceof sun.nio.ch.DirectBuffer;
  }
}
`,
    },
  ],
  [
    '-source and -target 8',
    `java {
    sourceCompatibility = JavaVersion.VERSION_1_8
    targetCompatibility = JavaVersion.VERSION_1_8
}
`,
    {},
  ],
];

const NULLAWAY_FORM =
  'Annotate what may be null with the @Nullable the project already uses ' +
  "(JSpecify's org.jspecify.annotations.Nullable if it uses none) and check it before use; " +
  'otherwise give it a non-null value.';
const projects = [];
const hint = (check, file) => exceptionHint(`errorprone/${check}`, file);

const FULL_PROJECT = {
  'src/main/java/demo/Wired.java': WIRED,
  'src/main/java/demo/Owner.java': OWNER,
  'src/main/java/demo/Bean.java': BEAN,
  'src/main/java/demo/DemoApplication.java': APPLICATION,
  'src/main/java/demo/Beans.java': CONFIGURATION,
  'src/main/java/demo/Names.java': NAMES,
  'src/test/java/demo/JobsCheck.java': JOBS_CHECK,
  'src/test/java/demo/samples/Samples.java': SAMPLES,
};

function writeProject(build, sources) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-errorprone-e2e-')));
  projects.push(root);
  const files = {
    'settings.gradle': "rootProject.name = 'jobs'\n",
    'build.gradle': `plugins {\n    id 'java'\n}\n${build}`,
    'src/main/java/demo/Jobs.java': JOBS,
    ...sources,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

function project(extraBuild = '') {
  return writeProject(`${DEPENDENCIES}${extraBuild}`, FULL_PROJECT);
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
  }, 300_000);

  afterAll(() => {
    for (const directory of projects.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('reports ignored results, main-code nulls and utility classes, but not framework fields or Spring config', () => {
    expect(run.status).toBe(0);
    const findings = applyRuleMessages(
      readErrorProneFindings({
        reportRoot: path.join(root, 'build/nitpicker'),
        roots: [root],
        lintedRoots: ['src/main/java', 'src/test/java'],
      }),
    );

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
        'NullAway',
        'src/main/java/demo/Bean.java',
        4,
        `@NonNull field 'name' not initialized. ${NULLAWAY_FORM} ${hint('NullAway', 'src/main/java/demo/Bean.java')}`,
      ],
      [
        'errorprone',
        'FutureReturnValueIgnored',
        'src/main/java/demo/Jobs.java',
        13,
        `Return value of methods returning Future must be checked. Ignoring returned Futures suppresses exceptions thrown from the code that completes the Future. Did you mean 'var unused = executor.submit(this::count);' or to remove this line? ${hint('FutureReturnValueIgnored', 'src/main/java/demo/Jobs.java')}`,
      ],
      [
        'errorprone',
        'NullAway',
        'src/main/java/demo/Jobs.java',
        26,
        'returning @Nullable expression from method with @NonNull return type. ' +
          `${NULLAWAY_FORM} ${hint('NullAway', 'src/main/java/demo/Jobs.java')}`,
      ],
      [
        'errorprone',
        'PrivateConstructorForUtilityClass',
        'src/main/java/demo/Names.java',
        5,
        'Classes which are not intended to be instantiated should be made non-instantiable with a ' +
          'private constructor. This includes utility classes (classes with only static members), ' +
          "and the main class. Did you mean 'public final class Names {'? " +
          hint('PrivateConstructorForUtilityClass', 'src/main/java/demo/Names.java'),
      ],
      [
        'errorprone',
        'NullAway',
        'src/main/java/demo/Owner.java',
        24,
        'returning @Nullable expression from method with @NonNull return type. ' +
          `${NULLAWAY_FORM} ${hint('NullAway', 'src/main/java/demo/Owner.java')}`,
      ],
      [
        'errorprone',
        'CheckReturnValue',
        'src/test/java/demo/JobsCheck.java',
        7,
        'The result of `count()` must be used. Use the result, or make the method return void if ' +
          'callers do not need it. Did you mean to remove this line? ' +
          hint('CheckReturnValue', 'src/test/java/demo/JobsCheck.java'),
      ],
      [
        'errorprone',
        'CheckReturnValue',
        'src/test/java/demo/JobsCheck.java',
        8,
        'The result of `make()` must be used. Use the result, or make the method return void if ' +
          'callers do not need it. Did you mean to remove this line? ' +
          hint('CheckReturnValue', 'src/test/java/demo/JobsCheck.java'),
      ],
    ]);
  });

  it('records the annotations of every class around a diagnostic, so a nested class is spared too', () => {
    const report = JSON.parse(
      readFileSync(path.join(root, 'build/nitpicker/errorprone.json'), 'utf8'),
    );

    expect(
      report
        .filter(({ file }) => file.endsWith('Beans.java'))
        .map(({ line, message, classAnnotations }) => [
          line,
          message.split(']')[0],
          classAnnotations.includes('org.springframework.context.annotation.Configuration'),
        ]),
    ).toStrictEqual([
      [6, '[PrivateConstructorForUtilityClass', true],
      [12, '[PrivateConstructorForUtilityClass', true],
    ]);
  });

  it('keeps --release when the only JDK-module option is an --add-opens, which javac never gets', () => {
    const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-levels-')));
    projects.push(work);
    writeFileSync(
      path.join(work, 'LevelProbe.java'),
      'public class LevelProbe {\n  public static void main(String[] args) {\n' +
        '    System.out.println(String.join(" ", ErrorProneReport.javacOptions(java.util.List.of(args))));\n' +
        '  }\n}\n',
    );
    const runner = path.join(GRADLE_DIRECTORY, 'errorprone/ErrorProneReport.java');
    spawnSync('javac', ['-d', work, runner, path.join(work, 'LevelProbe.java')], {
      encoding: 'utf8',
    });
    const options = (...args) =>
      spawnSync('java', ['-cp', work, 'LevelProbe', ...args], { encoding: 'utf8' }).stdout.trim();
    const project = (option) => [
      `--project-arg=${option}`,
      '--project-arg=java.base/java.lang=ALL-UNNAMED',
    ];

    expect([
      options('--release=17', ...project('--add-opens')),
      options('--release=17', ...project('--add-exports')),
    ]).toStrictEqual([
      '--release 17',
      '--add-exports=java.base/java.lang=ALL-UNNAMED -source 17 -target 17',
    ]);
  });

  it('compiles into its own directory and leaves the regular compile alone', () => {
    expect(
      existsSync(path.join(root, 'build/nitpicker/errorprone/classes/main/demo/Jobs.class')),
    ).toBe(true);
    expect(regularClass(root).equals(regularBefore)).toBe(true);
  });

  it('fails the build, with no report, when its own compile fails', () => {
    const broken = project(BREAK_ONLY_THE_EXTRA_COMPILE);
    const result = runGradle(broken, 'nitpickerErrorProne');
    const cause = /Error Prone could not compile the sources: (.*)$/m.exec(result.stderr)?.[1];

    expect(result.status).toBe(1);
    expect(cause).toBe(
      `${path.join(broken, 'src/main/java/demo/Broken.java')}:1: incompatible types: java.lang.String cannot be converted to int`,
    );
    expect(existsSync(path.join(broken, 'build/nitpicker/errorprone.json'))).toBe(false);
  }, 180_000);

  it.each(LEVEL_FORMS)(
    'compiles a project built with %s in the same form',
    (_, build, files) => {
      const levelRoot = writeProject(build, files);
      const result = runGradle(levelRoot, 'nitpickerErrorProne');
      const rules = readErrorProneFindings({
        reportRoot: path.join(levelRoot, 'build/nitpicker'),
        roots: [levelRoot],
        lintedRoots: ['src/main/java'],
      }).map((finding) => finding.rule);

      expect([result.status, rules.includes('FutureReturnValueIgnored')]).toStrictEqual([0, true]);
    },
    180_000,
  );
});
