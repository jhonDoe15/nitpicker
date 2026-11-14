import { describe, expect, it } from 'vitest';
import { springFix } from '../../../test-support/spring-fix-project.mjs';

const PROPS = 'src/main/resources/application.properties';
const BUILDS = {
  gradle: { 'build.gradle': "plugins { id 'java' }\n" },
  maven: { 'pom.xml': '<project/>\n' },
};
const SOURCES = {
  java: { 'src/main/java/demo/Shop.java': 'import jakarta.persistence.Entity;\nclass Shop {}\n' },
  kotlin: { 'src/main/kotlin/demo/Shop.kt': 'import jakarta.persistence.Entity\nclass Shop\n' },
};

const SAMPLE = [
  '# Shop settings',
  'spring.datasource.url = jdbc:postgresql://db/shop',
  'spring.datasource.password=hunter2',
  'spring.jpa.hibernate.ddl-auto : update',
  'spring.jpa.open-in-view=true',
  'server.error.include-stacktrace=always',
  'server.error.include-exception=true',
  'management.endpoints.web.exposure.include=*',
  'spring.main.allow-circular-references=true',
  'spring.h2.console.enabled=true',
  'management.endpoint.health.show-details=always',
  'spring.profiles.active=dev',
  '',
].join('\n');

function sample(text, build = 'gradle', language = 'java') {
  return { ...BUILDS[build], ...SOURCES[language], [PROPS]: text };
}

function env(name) {
  return `\${${name}}`;
}

function line(text, key) {
  return text.split('\n').find((candidate) => candidate.startsWith(key));
}

describe('Spring properties recipes', () => {
  it.each([
    [
      'ddl-auto',
      'spring.jpa.hibernate.ddl-auto : update',
      'spring.jpa.hibernate.ddl-auto : validate',
    ],
    ['open-in-view', 'spring.jpa.open-in-view=true', 'spring.jpa.open-in-view=false'],
    [
      'actuator-exposure',
      'management.endpoints.web.exposure.include=*',
      'management.endpoints.web.exposure.include=health',
    ],
    [
      'literal-secret',
      'spring.datasource.password=hunter2',
      `spring.datasource.password=${env('SPRING_DATASOURCE_PASSWORD')}`,
    ],
    ['active-profile', 'spring.profiles.active=dev', 'spring.profiles.default=dev'],
  ])('fixes %s and leaves the rest of the file alone', (rule, from, to) => {
    const { read, result } = springFix({ files: sample(SAMPLE), rule });

    expect(read(PROPS)).toBe(SAMPLE.replace(from, to));
    expect(result.toolErrors).toEqual([]);
    expect(result.fixedFindings).toHaveLength(1);
  });
  it('sets every error detail to its allowed value', () => {
    const { read, result } = springFix({ files: sample(SAMPLE), rule: 'error-details' });

    expect(read(PROPS)).toBe(
      SAMPLE.replace('include-stacktrace=always', 'include-stacktrace=never').replace(
        'include-exception=true',
        'include-exception=false',
      ),
    );
    expect(result.fixedFindings).toHaveLength(2);
  });
  it('removes risky startup flags and unsafe diagnostics together with their lines', () => {
    const flags = springFix({ files: sample(SAMPLE), rule: 'risky-startup-flags' });
    const diagnostics = springFix({ files: sample(SAMPLE), rule: 'unsafe-diagnostics' });

    expect(flags.read(PROPS)).toBe(
      SAMPLE.replace('spring.main.allow-circular-references=true\n', ''),
    );
    expect(diagnostics.read(PROPS)).toBe(
      SAMPLE.replace('spring.h2.console.enabled=true\n', '').replace(
        'management.endpoint.health.show-details=always',
        'management.endpoint.health.show-details=when-authorized',
      ),
    );
  });
  it.each(
    ['gradle', 'maven'].flatMap((build) =>
      ['java', 'kotlin'].flatMap((language) =>
        ['ddl-auto', 'open-in-view', 'risky-startup-flags', 'actuator-exposure'].map((rule) => [
          build,
          language,
          rule,
        ]),
      ),
    ),
  )('leaves no finding of the fixed rule on %s with %s sources (%s)', (build, language, rule) => {
    const { remaining, read } = springFix({
      files: sample(SAMPLE, build, language),
      rule,
      preset: language,
    });

    expect(remaining(rule)).toEqual([]);
    expect(read(PROPS)).not.toBe(SAMPLE);
  });
  it('runs only the selected rule', () => {
    const { read } = springFix({ files: sample(SAMPLE), rule: 'ddl-auto' });

    expect(line(read(PROPS), 'spring.jpa.open-in-view')).toBe('spring.jpa.open-in-view=true');
  });
  it('keeps CRLF line endings and a missing final newline', () => {
    const text = 'spring.jpa.open-in-view=true\r\nspring.main.lazy-initialization=true';
    const { read } = springFix({ files: sample(text), rule: 'risky-startup-flags' });

    expect(read(PROPS)).toBe('spring.jpa.open-in-view=true');
  });
  it.each([
    [
      'literal-secret',
      `app.api-key=${env('API_KEY:letmein')}\nspring.datasource.password=${env('DB_PASSWORD')}\n`,
      `app.api-key=${env('API_KEY')}\nspring.datasource.password=${env('DB_PASSWORD')}\n`,
    ],
    [
      'literal-secret',
      `app.token=${env('A:' + env('B:l3tm3in'))}\n`,
      `app.token=${env('A:' + env('B'))}\n`,
    ],
    [
      'error-details',
      `server.error.include-message=${env('SHOW:always')}\n`,
      `server.error.include-message=${env('SHOW:never')}\n`,
    ],
  ])('keeps the placeholder around the value it changes (%s)', (rule, text, expected) => {
    const { read } = springFix({ files: sample(text), rule });

    expect(read(PROPS)).toBe(expected);
  });
  it('does not touch profile documents of tests, and values already allowed', () => {
    const files = {
      ...sample('spring.jpa.hibernate.ddl-auto=validate\n'),
      'src/main/resources/application-test.properties': 'spring.jpa.hibernate.ddl-auto=create\n',
    };
    const { result } = springFix({ files, rule: 'ddl-auto' });

    expect(result.fixedFindings).toEqual([]);
  });
  it('adds open-in-view=false at the end of a main file that never sets it', () => {
    const text = 'server.port=8080\n';
    const { read, remaining } = springFix({ files: sample(text), rule: 'open-in-view' });

    expect(read(PROPS)).toBe('server.port=8080\nspring.jpa.open-in-view=false\n');
    expect(remaining('open-in-view')).toEqual([]);
  });
  it('adds open-in-view=false to the first document of a multi-document file', () => {
    const text =
      'server.port=8080\n#---\nspring.config.activate.on-profile=prod\nlogging.level.root=warn\n';
    const { read } = springFix({ files: sample(text), rule: 'open-in-view' });

    expect(read(PROPS)).toBe(
      'server.port=8080\nspring.jpa.open-in-view=false\n#---\nspring.config.activate.on-profile=prod\nlogging.level.root=warn\n',
    );
  });
  it('reads changed files in a nested module and leaves other modules alone', () => {
    const files = {
      'service/src/main/resources/application.properties': 'spring.jpa.hibernate.ddl-auto=update\n',
      'other/src/main/resources/application.properties': 'spring.jpa.hibernate.ddl-auto=update\n',
    };
    const { read } = springFix({
      files,
      changed: ['service/src/main/resources/application.properties'],
      rule: 'ddl-auto',
    });

    expect(read('service/src/main/resources/application.properties')).toBe(
      'spring.jpa.hibernate.ddl-auto=validate\n',
    );
    expect(read('other/src/main/resources/application.properties')).toBe(
      'spring.jpa.hibernate.ddl-auto=update\n',
    );
  });
});
