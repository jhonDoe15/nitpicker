import { describe, expect, it } from 'vitest';
import { springFix } from '../../../test-support/spring-fix-project.mjs';

const JAVA_APP = `package demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
`;
const KOTLIN_APP = `package demo

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class Application

fun main(args: Array<String>) {
  runApplication<Application>(*args)
}
`;
const JAVA_JOB = `package demo;

import org.springframework.scheduling.annotation.Scheduled;

class Job {
  @Scheduled(fixedRate = 1000)
  void tick() {}
}
`;
const KOTLIN_JOB = `package demo

import org.springframework.scheduling.annotation.Scheduled

class Job {
  @Scheduled(fixedRate = 1000)
  fun tick() {}
}
`;
const JAVA_EXPECTED = JAVA_APP.replace(
  'SpringBootApplication;\n',
  'SpringBootApplication;\nimport org.springframework.scheduling.annotation.EnableScheduling;\n',
).replace('\n@SpringBootApplication', '\n@EnableScheduling\n@SpringBootApplication');
const KOTLIN_EXPECTED = KOTLIN_APP.replace(
  'runApplication\n',
  'runApplication\nimport org.springframework.scheduling.annotation.EnableScheduling\n',
).replace('\n@SpringBootApplication', '\n@EnableScheduling\n@SpringBootApplication');
const BUILDS = {
  gradle: { 'build.gradle': "plugins { id 'java' }\n" },
  maven: { 'pom.xml': '<project/>\n' },
};

function project(build, language, extra = {}) {
  const kotlin = language === 'kotlin';
  const dir = kotlin ? 'src/main/kotlin/demo' : 'src/main/java/demo';
  const ext = kotlin ? 'kt' : 'java';
  return {
    files: {
      ...BUILDS[build],
      [`${dir}/Application.${ext}`]: kotlin ? KOTLIN_APP : JAVA_APP,
      [`${dir}/Job.${ext}`]: kotlin ? KOTLIN_JOB : JAVA_JOB,
      ...extra,
    },
    app: `${dir}/Application.${ext}`,
    job: `${dir}/Job.${ext}`,
  };
}

describe('missing-enable recipe', () => {
  it.each([
    ['gradle', 'java', JAVA_EXPECTED],
    ['maven', 'java', JAVA_EXPECTED],
    ['gradle', 'kotlin', KOTLIN_EXPECTED],
    ['maven', 'kotlin', KOTLIN_EXPECTED],
  ])('adds @EnableScheduling and its import on %s with %s sources', (build, language, expected) => {
    const { files, app, job } = project(build, language);
    const { read, remaining, result } = springFix({
      files,
      changed: [job],
      rule: 'missing-enable',
      preset: language,
    });

    expect(read(app)).toBe(expected);
    expect(read(job)).toBe(files[job]);
    expect(remaining('missing-enable')).toEqual([]);
    expect(result.fixedFindings).toEqual([
      `${job}:6 spring/missing-enable (spring-missing-enable)`,
    ]);
  });
  it('adds every missing annotation to the application class in one edit', () => {
    const { files, app, job } = project('gradle', 'java');
    const other = {
      'src/main/java/demo/Cache.java': `package demo;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.scheduling.annotation.Async;

class Cache {
  @Cacheable("a")
  String get() { return ""; }
  @Async
  void run() {}
}
`,
    };
    const { read, remaining } = springFix({
      files: { ...files, ...other },
      rule: 'missing-enable',
    });

    expect(read(app)).toBe(
      JAVA_APP.replace(
        'SpringBootApplication;\n',
        'SpringBootApplication;\nimport org.springframework.cache.annotation.EnableCaching;\nimport org.springframework.scheduling.annotation.EnableAsync;\nimport org.springframework.scheduling.annotation.EnableScheduling;\n',
      ).replace(
        '\n@SpringBootApplication',
        '\n@EnableScheduling\n@EnableAsync\n@EnableCaching\n@SpringBootApplication',
      ),
    );
    expect(remaining('missing-enable')).toEqual([]);
    expect(read(job)).toBe(files[job]);
  });
  it('enables @Secured too when the project uses it', () => {
    const { files, app } = project('maven', 'java', {
      'src/main/java/demo/Admin.java': `package demo;

import org.springframework.security.access.annotation.Secured;

class Admin {
  @Secured("ROLE_ADMIN")
  void run() {}
}
`,
    });
    const { read } = springFix({
      files,
      changed: ['src/main/java/demo/Admin.java'],
      rule: 'missing-enable',
    });

    expect(read(app)).toBe(
      JAVA_APP.replace(
        'SpringBootApplication;\n',
        'SpringBootApplication;\nimport org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;\n',
      ).replace(
        '\n@SpringBootApplication',
        '\n@EnableMethodSecurity(securedEnabled = true)\n@SpringBootApplication',
      ),
    );
  });
  it('does not add an import that is there, and puts the import in a file without imports', () => {
    const imported = JAVA_APP.replace(
      'import org.springframework.boot.SpringApplication;',
      'import org.springframework.boot.SpringApplication;\nimport org.springframework.scheduling.annotation.*;',
    );
    const bare =
      'package demo;\n\n@org.springframework.boot.autoconfigure.SpringBootApplication\nclass Application {}\n';
    const first = project('gradle', 'java', { 'src/main/java/demo/Application.java': imported });
    const second = project('gradle', 'java', { 'src/main/java/demo/Application.java': bare });
    const a = springFix({ files: first.files, rule: 'missing-enable' });
    const b = springFix({ files: second.files, rule: 'missing-enable' });

    expect(a.read(first.app)).toBe(
      imported.replace('\n@SpringBootApplication', '\n@EnableScheduling\n@SpringBootApplication'),
    );
    expect(b.read(second.app)).toBe(
      'package demo;\n\nimport org.springframework.scheduling.annotation.EnableScheduling;\n\n@EnableScheduling\n@org.springframework.boot.autoconfigure.SpringBootApplication\nclass Application {}\n',
    );
  });
  it('names the problem when there is not exactly one application class', () => {
    const { files, job } = project('gradle', 'java', {
      'src/main/java/demo/Second.java': JAVA_APP.replaceAll(
        'Application.class',
        'Second.class',
      ).replace('class Application', 'class Second'),
    });
    const bare = project('gradle', 'java');
    const none = {
      ...bare,
      files: Object.fromEntries(Object.entries(bare.files).filter(([name]) => name !== bare.app)),
    };
    const many = springFix({ files, changed: [job], rule: 'missing-enable' });
    const missing = springFix({ files: none.files, changed: [none.job], rule: 'missing-enable' });

    expect(many.result.notes).toEqual([
      'spring/missing-enable in .: left as is, more than one @SpringBootApplication class found',
    ]);
    expect(missing.result.notes).toEqual([
      'spring/missing-enable in .: left as is, no @SpringBootApplication class found',
    ]);
    expect(many.result.fixedFindings).toEqual([]);
  });
  it('leaves a project that already enables the feature alone', () => {
    const { files, app } = project('gradle', 'java', {
      'src/main/java/demo/Config.java':
        'package demo;\n\nimport org.springframework.scheduling.annotation.EnableScheduling;\n\n@EnableScheduling\nclass Config {}\n',
    });
    const { read, result } = springFix({ files, rule: 'missing-enable' });

    expect(read(app)).toBe(files[app]);
    expect(result.fixedFindings).toEqual([]);
  });
  it('leaves @Retryable of Spring Framework resilience to a person', () => {
    const { files, app } = project('gradle', 'java', {
      'src/main/java/demo/Flaky.java':
        'package demo;\n\nimport org.springframework.resilience.annotation.Retryable;\n\nclass Flaky {\n  @Retryable\n  void run() {}\n}\n',
    });
    const { read } = springFix({
      files,
      changed: ['src/main/java/demo/Flaky.java'],
      rule: 'missing-enable',
    });

    expect(read(app)).toBe(files[app]);
  });
});
