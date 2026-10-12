import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { createJavaAnalyzer } from './java-analyzer.mjs';
import { applyJavaPolicy } from './java-policy.mjs';
import { readSpringConfigFindings } from './java-spring.mjs';
import { parseProperties, parseYaml, relaxKey } from './spring-config-parser.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files, { jpa = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-spring-'));
  roots.push(root);
  const all = {
    ...(jpa
      ? { 'src/main/java/demo/Repo.java': 'package demo;\nimport jakarta.persistence.Entity;\n' }
      : { 'src/main/java/demo/Plain.java': 'package demo;\nclass Plain {}\n' }),
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const sourceRoots = ['src/main/java'];
const resource = (name) => `src/main/resources/${name}`;

function read(files, options) {
  return readSpringConfigFindings(project(files, options), { sourceRoots });
}

function openInView(file, line) {
  return {
    tool: 'spring',
    rule: 'open-in-view',
    path: file,
    identity: line === undefined ? 'spring.jpa.openinview:missing' : 'spring.jpa.openinview',
    message: expect.any(String),
    classification: 'enforceable',
    ...(line === undefined ? {} : { location: { line } }),
  };
}

const OPEN_IN_VIEW_OFF = 'spring.jpa.open-in-view=false';
const OPEN_IN_VIEW_OFF_YAML = 'spring.jpa.open-in-view: false';
function rules(findings) {
  return findings.map((finding) => finding.rule);
}

describe('parseProperties', () => {
  it('reads separators, comments, continuations and line numbers', () => {
    const [document] = parseProperties(
      [
        '# comment',
        '! also a comment',
        'a.b=1',
        '  c.d : two  ',
        'e.f three',
        'long=one \\',
        '   two',
        'after=x',
        'empty=',
        'esc\\:aped=y',
      ].join('\n'),
    );

    expect(document.entries.map(({ key, value, line }) => [key, value, line])).toEqual([
      ['a.b', '1', 3],
      ['c.d', 'two', 4],
      ['e.f', 'three', 5],
      ['long', 'one two', 6],
      ['after', 'x', 8],
      ['empty', '', 9],
      ['esc:aped', 'y', 10],
    ]);
  });

  it('does not continue a comment line', () => {
    const [document] = parseProperties('# note \\\na=1');

    expect(document.entries.map(({ key }) => key)).toEqual(['a']);
  });
});

describe('parseYaml', () => {
  const flat = (text) =>
    parseYaml(text).flatMap(({ entries }) =>
      entries.map(({ key, value, line }) => [key, value, line]),
    );

  it('flattens nested maps and dotted keys with line numbers', () => {
    expect(
      flat(
        [
          'spring:',
          '  jpa:',
          '    open-in-view: true',
          '  main.lazy-initialization: false',
          'top: 1',
        ].join('\n'),
      ),
    ).toEqual([
      ['spring.jpa.open-in-view', 'true', 3],
      ['spring.main.lazy-initialization', 'false', 4],
      ['top', '1', 5],
    ]);
  });

  it('strips comments outside quotes and unquotes scalars', () => {
    expect(
      flat(
        [
          'a: 1 # trailing',
          '# whole line',
          'b: "x # not a comment" # comment',
          "c: 'it''s'",
          "d: ''  # empty",
          'url: http://host:80/path#frag',
          "e: it's fine",
        ].join('\n'),
      ),
    ).toEqual([
      ['a', '1', 1],
      ['b', 'x # not a comment', 3],
      ['c', "it''s", 4],
      ['d', '', 5],
      ['url', 'http://host:80/path#frag', 6],
      ['e', "it's fine", 7],
    ]);
  });

  it('ignores list items and block scalars', () => {
    const documents = parseYaml(
      [
        'items:',
        '  - name: a',
        '    password: hidden',
        '  - b',
        'script: |',
        '  password: nope',
        '  more',
        'folded: >-',
        '  text',
        'after: ok',
      ].join('\n'),
    );

    expect(documents[0].entries.map(({ key, value, list }) => [key, value, list])).toEqual([
      ['items', 'b', true],
      ['after', 'ok', false],
    ]);
  });

  it('keeps scalar list items only as list entries of their parent key', () => {
    const [document] = parseYaml('include:\n  - health\n  - "*"\nnext: 1');

    expect(document.entries).toEqual([
      { key: 'include', value: 'health', line: 2, list: true },
      { key: 'include', value: '*', line: 3, list: true },
      { key: 'next', value: '1', line: 4, list: false },
    ]);
  });

  it('splits multi-document files and drops empty documents', () => {
    const documents = parseYaml(
      [
        '---',
        'a: 1',
        '---',
        'spring:',
        '  config:',
        '    activate:',
        '      on-profile: test',
        'b: 2',
      ].join('\n'),
    );

    expect(documents).toHaveLength(2);
    expect(documents[1].entries.map(({ key, value }) => [key, value])).toEqual([
      ['spring.config.activate.on-profile', 'test'],
      ['b', '2'],
    ]);
  });
});

describe('relaxKey', () => {
  it('matches camel, snake and kebab case', () => {
    const forms = ['spring.jpa.open-in-view', 'spring.jpa.openInView', 'SPRING.JPA.open_in_view'];

    expect(new Set(forms.map(relaxKey)).size).toBe(1);
  });
});

describe('readSpringConfigFindings', () => {
  it('reports nothing without Spring configuration files', () => {
    expect(read({ 'src/main/resources/data.properties': 'spring.jpa.open-in-view=true' })).toEqual(
      [],
    );
    expect(read({})).toEqual([]);
  });

  it('shapes findings with the printed id, the allowance sentence and a line location', () => {
    const findings = read({
      [resource('application.properties')]: '\n\nspring.jpa.open-in-view=true\n',
    });

    expect(findings).toEqual([
      {
        tool: 'spring',
        rule: 'open-in-view',
        path: 'src/main/resources/application.properties',
        identity: 'spring.jpa.openinview',
        message: expect.stringMatching(
          /open-in-view[^]*To allow it here, add an exception for spring\/open-in-view in nitpicker\.config\.json\.$/,
        ),
        classification: 'enforceable',
        location: { line: 3 },
      },
    ]);
    expect(parseAnalyzerReport({ findings })).toBeDefined();
  });

  it('lets a spring/<rule> exception drop the finding', () => {
    const findings = read({ [resource('application.properties')]: 'spring.jpa.open-in-view=true' });

    expect(
      applyJavaPolicy(findings, {
        exceptions: [{ rule: 'spring/open-in-view', paths: ['src/main/resources/**'] }],
      }),
    ).toEqual([]);
  });

  it('honors manifest resource roots, including nested module roots', () => {
    const root = project({ 'app/conf/application.yml': 'spring.jpa.open-in-view: true' });

    expect(readSpringConfigFindings(root, { sourceRoots, resourceRoots: ['app/conf/'] })).toEqual([
      openInView('app/conf/application.yml', 1),
    ]);
    expect(readSpringConfigFindings(root, { sourceRoots })).toEqual([]);
  });

  it('only reads application files directly in a resource root', () => {
    const findings = read({
      [resource('config/application.properties')]: 'spring.jpa.open-in-view=true',
      [resource('other.properties')]: 'spring.jpa.open-in-view=true',
      [resource('application-.properties')]: 'spring.jpa.open-in-view=true',
    });

    expect(findings).toEqual([]);
  });

  it('keeps identity when lines shift', () => {
    const plain = read(
      { [resource('application.yml')]: 'server:\n  error:\n    include-stacktrace: always\n' },
      { jpa: false },
    );
    const shifted = read(
      {
        [resource('application.yml')]:
          '# a\n# b\n\nserver:\n  error:\n    include-stacktrace: always\n',
      },
      { jpa: false },
    );

    expect(plain[0].identity).toBe(shifted[0].identity);
    expect(plain[0].location.line).not.toBe(shifted[0].location.line);
  });

  it('numbers repeats of the same key in one file', () => {
    const findings = read(
      {
        [resource('application.yml')]:
          'spring.main.lazy-initialization: true\n---\nspring.main.lazy-initialization: true\n',
      },
      { jpa: false },
    );

    expect(findings.map((finding) => finding.identity)).toEqual([
      'spring.main.lazyinitialization',
      'spring.main.lazyinitialization#2',
    ]);
  });
});

describe('open-in-view', () => {
  it('fires once at the main file when a JPA project leaves it unset', () => {
    const findings = read({
      [resource('application-prod.properties')]: 'x=1',
      [resource('application.properties')]: 'x=1',
      [resource('application.yml')]: 'x: 1',
    });

    expect(findings).toEqual([openInView('src/main/resources/application.properties')]);
  });

  it('anchors at the first application file when there is no main file', () => {
    const findings = read({
      [resource('application-b.properties')]: 'x=1',
      [resource('application-a.properties')]: 'x=1',
    });

    expect(findings.map((finding) => finding.path)).toEqual([
      'src/main/resources/application-a.properties',
    ]);
  });

  it('accepts false in the main file, relaxed forms, and non-test profile files', () => {
    expect(read({ [resource('application.properties')]: OPEN_IN_VIEW_OFF })).toEqual([]);
    expect(
      read({ [resource('application.yml')]: 'spring:\n  jpa:\n    openInView: false' }),
    ).toEqual([]);
    expect(
      read({
        [resource('application.properties')]: 'x=1',
        [resource('application-prod.properties')]: OPEN_IN_VIEW_OFF,
      }),
    ).toEqual([]);
  });

  it('does not count false set only in a test profile', () => {
    const findings = read({
      [resource('application.properties')]: 'x=1',
      [resource('application-test.properties')]: OPEN_IN_VIEW_OFF,
    });

    expect(rules(findings)).toEqual(['open-in-view']);
  });

  it('flags true outside test profiles but not in them', () => {
    expect(
      read({
        [resource('application.yml')]:
          `${OPEN_IN_VIEW_OFF_YAML}\n---\nspring:\n  config.activate.on-profile: local\n  jpa.open-in-view: true\n`,
      }),
    ).toEqual([openInView('src/main/resources/application.yml', 5)]);
    expect(
      read({
        [resource('application.properties')]: OPEN_IN_VIEW_OFF,
        [resource('application-testcontainers.properties')]: 'spring.jpa.open-in-view=true',
      }),
    ).toEqual([]);
  });

  it('is silent for projects without JPA', () => {
    expect(read({ [resource('application.properties')]: 'x=1' }, { jpa: false })).toEqual([]);
    expect(
      read(
        { [resource('application.properties')]: 'spring.jpa.open-in-view=true' },
        { jpa: false },
      ),
    ).toEqual([]);
  });

  it('recognizes the javax namespace', () => {
    const findings = read(
      {
        'src/main/java/demo/Old.java': 'import javax.persistence.Id;\n',
        [resource('application.properties')]: 'x=1',
      },
      { jpa: false },
    );

    expect(rules(findings)).toEqual(['open-in-view']);
  });
});

describe('ddl-auto', () => {
  it('flags values other than none and validate, and generate-ddl=true', () => {
    const findings = read({
      [resource('application.properties')]: [
        OPEN_IN_VIEW_OFF,
        'spring.jpa.hibernate.ddl-auto=update',
        'spring.jpa.generate-ddl=true',
      ].join('\n'),
    });

    expect(findings.map((finding) => [finding.rule, finding.identity])).toEqual([
      ['ddl-auto', 'spring.jpa.hibernate.ddlauto'],
      ['ddl-auto', 'spring.jpa.generateddl'],
    ]);
  });

  it.each(['none', 'validate', 'VALIDATE', '${DDL:update}'])('accepts %s', (mode) => {
    expect(
      read({
        [resource('application.properties')]:
          `${OPEN_IN_VIEW_OFF}\nspring.jpa.hibernate.ddl-auto=${mode}\nspring.jpa.generate-ddl=false`,
      }),
    ).toEqual([]);
  });

  it.each(['test', 'testcontainers', 'local', 'dev'])('is exempt in the %s profile', (profile) => {
    expect(
      read({
        [resource('application.properties')]: OPEN_IN_VIEW_OFF,
        [resource(`application-${profile}.yml`)]: 'spring.jpa.hibernate.ddl-auto: create-drop',
      }),
    ).toEqual([]);
  });

  it('is not exempt in other profiles, nor in a prod document of a multi-document file', () => {
    const findings = read({
      [resource('application.yml')]: [
        OPEN_IN_VIEW_OFF_YAML,
        '---',
        'spring.config.activate.on-profile: prod',
        'spring.jpa.hibernate.ddl-auto: update',
        '---',
        'spring.config.activate.on-profile: dev',
        'spring.jpa.hibernate.ddl-auto: update',
        '---',
        'spring.profiles: test',
        'spring.jpa.hibernate.ddl-auto: update',
      ].join('\n'),
    });

    expect(findings.map((finding) => [finding.rule, finding.location.line])).toEqual([
      ['ddl-auto', 4],
    ]);
  });

  it('reads profile lists', () => {
    const findings = read({
      [resource('application.yml')]: [
        OPEN_IN_VIEW_OFF_YAML,
        '---',
        'spring.config.activate.on-profile:',
        '  - dev',
        '  - test',
        'spring.jpa.hibernate.ddl-auto: update',
      ].join('\n'),
    });

    expect(findings).toEqual([]);
  });
});

describe('risky-startup-flags', () => {
  const flags = [
    'spring.main.allow-circular-references',
    'spring.main.allow-bean-definition-overriding',
    'spring.main.lazy-initialization',
  ];

  it('flags each key once, including in local and dev profiles', () => {
    const findings = read(
      {
        [resource('application.properties')]: flags.map((flag) => `${flag}=true`).join('\n'),
        [resource('application-dev.properties')]: 'spring.main.lazy-initialization=true',
      },
      { jpa: false },
    );

    expect(findings.map((finding) => [finding.path.split('/').at(-1), finding.identity])).toEqual([
      ['application-dev.properties', 'spring.main.lazyinitialization'],
      ['application.properties', 'spring.main.allowcircularreferences'],
      ['application.properties', 'spring.main.allowbeandefinitionoverriding'],
      ['application.properties', 'spring.main.lazyinitialization'],
    ]);
    expect(findings[1].message.split(' ')[0]).toBe('spring.main.allow-circular-references=true');
  });

  it('is silent for false, relaxed false, and test profiles', () => {
    expect(
      read(
        {
          [resource('application.properties')]:
            'spring.main.allowCircularReferences=false\nspring.main.lazy_initialization=false',
          [resource('application-test.properties')]: flags.map((flag) => `${flag}=true`).join('\n'),
        },
        { jpa: false },
      ),
    ).toEqual([]);
  });

  it('matches relaxed true keys', () => {
    const findings = read(
      { [resource('application.yml')]: 'spring:\n  main:\n    lazyInitialization: true' },
      { jpa: false },
    );

    expect(rules(findings)).toEqual(['risky-startup-flags']);
  });
});

describe('actuator-exposure', () => {
  const exposure = 'management.endpoints.web.exposure.include';

  it.each([
    `${exposure}=*`,
    `${exposure}=health,*`,
    `${exposure}: "*"`,
    `${exposure}: [health, '*']`,
  ])('flags %s', (line) => {
    const name = line.includes(': ') ? 'application.yml' : 'application.properties';
    expect(rules(read({ [resource(name)]: line }, { jpa: false }))).toEqual(['actuator-exposure']);
  });

  it('flags a YAML list containing *', () => {
    const text =
      'management:\n  endpoints:\n    web:\n      exposure:\n        include:\n          - "*"\n';

    expect(rules(read({ [resource('application.yml')]: text }, { jpa: false }))).toEqual([
      'actuator-exposure',
    ]);
  });

  it('accepts named endpoints and local, dev and test profiles', () => {
    expect(
      read(
        {
          [resource('application.properties')]: `${exposure}=health,info`,
          [resource('application-local.properties')]: `${exposure}=*`,
          [resource('application-dev.properties')]: `${exposure}=*`,
          [resource('application-test.properties')]: `${exposure}=*`,
        },
        { jpa: false },
      ),
    ).toEqual([]);
  });
});

describe('error-details', () => {
  it.each(['always', 'on-param', 'on_param', 'ALWAYS'])('flags %s', (value) => {
    expect(
      rules(
        read(
          { [resource('application.properties')]: `server.error.include-stacktrace=${value}` },
          { jpa: false },
        ),
      ),
    ).toEqual(['error-details']);
  });

  it('accepts never and exempt profiles', () => {
    expect(
      read(
        {
          [resource('application.properties')]: 'server.error.include-stacktrace=never',
          [resource('application-dev.properties')]: 'server.error.include-stacktrace=always',
          [resource('application-test.properties')]: 'server.error.include-stacktrace=always',
        },
        { jpa: false },
      ),
    ).toEqual([]);
  });
});

describe('literal-secret', () => {
  const secretKeys = [
    'spring.datasource.password',
    'app.secret',
    'app.api-key',
    'app.apiKey',
    'app.private_key',
    'app.client-secret',
    'app.credentials',
    'jwt.token',
    'server.ssl.key-store-password',
    'app.refresh-token',
    'app.service.jwtSecret',
  ];

  it.each(secretKeys)('flags a literal in %s without leaking the value', (key) => {
    const findings = read(
      { [resource('application.properties')]: `${key}=hunter2value` },
      { jpa: false },
    );

    expect(rules(findings)).toEqual(['literal-secret']);
    expect(JSON.stringify(findings)).not.toContain('hunter2value');
  });

  it('flags YAML values and ignores placeholders, empty values and other keys', () => {
    const findings = read(
      {
        [resource('application.yml')]: [
          'spring:',
          '  datasource:',
          '    password: "s3cr3t"',
          '    username: admin',
          'app:',
          '  token: ${APP_TOKEN}',
          '  secret:',
          '  token-validity-seconds: 3600',
          '  passwords-file: x',
          '  keys:',
          '    - password',
        ].join('\n'),
      },
      { jpa: false },
    );

    expect(findings.map((finding) => [finding.identity, finding.location.line])).toEqual([
      ['spring.datasource.password', 3],
    ]);
  });

  it('is exempt in test, local and dev profiles only', () => {
    const findings = read(
      {
        [resource('application-test.properties')]: 'app.password=a',
        [resource('application-local.properties')]: 'app.password=a',
        [resource('application-dev.properties')]: 'app.password=a',
        [resource('application-prod.properties')]: 'app.password=a',
      },
      { jpa: false },
    );

    expect(findings.map((finding) => finding.path)).toEqual([
      'src/main/resources/application-prod.properties',
    ]);
  });

  it('keeps identity independent of the value', () => {
    const first = read(
      { [resource('application.properties')]: 'app.password=one' },
      { jpa: false },
    );
    const second = read(
      { [resource('application.properties')]: 'app.password=two' },
      { jpa: false },
    );

    expect(first[0].identity).toBe(second[0].identity);
  });
});

describe('Java analyzer declaration', () => {
  it('declares spring as a reported tool', () => {
    expect(createJavaAnalyzer().reportedTools.includes('spring')).toBe(true);
  });
});
