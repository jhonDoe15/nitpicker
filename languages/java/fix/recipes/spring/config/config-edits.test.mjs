import { describe, expect, it } from 'vitest';
import { springFix } from '../../../test-support/spring-fix-project.mjs';

const YML = 'src/main/resources/application.yml';
const SOURCE = {
  'src/main/java/demo/Shop.java': 'import jakarta.persistence.Entity;\nclass Shop {}\n',
};

const SAMPLE = `# Shop settings
spring:
  application:
    name: shop   # keep
  jpa:
    hibernate:
      ddl-auto: "update"   # dev leftover
    open-in-view: true
  h2:
    console:
      enabled: true
  datasource:
    username: bob
    password: 'hunter2'
management:
  endpoints:
    web:
      exposure:
        include: '*'
---
spring:
  config:
    activate:
      on-profile: prod
  profiles:
    active: dev
`;

function env(name) {
  return `\${${name}}`;
}

function run(text, rule, extra = {}) {
  return springFix({ files: { ...SOURCE, [YML]: text, ...extra }, rule });
}

describe('Spring YAML recipes', () => {
  it.each([
    ['ddl-auto', 'ddl-auto: "update"', 'ddl-auto: "validate"'],
    ['open-in-view', 'open-in-view: true', 'open-in-view: false'],
    ['literal-secret', "password: 'hunter2'", `password: '${env('SPRING_DATASOURCE_PASSWORD')}'`],
    ['actuator-exposure', "include: '*'", "include: 'health'"],
  ])('fixes %s keeping quotes, comments and the other document', (rule, from, to) => {
    const { read, result } = run(SAMPLE, rule);

    expect(read(YML)).toBe(SAMPLE.replace(from, to));
    expect(result.toolErrors).toEqual([]);
  });
  it('removes an unsafe setting and the parents it empties', () => {
    const { read, remaining } = run(SAMPLE, 'unsafe-diagnostics');

    expect(read(YML)).toBe(SAMPLE.replace('  h2:\n    console:\n      enabled: true\n', ''));
    expect(remaining('unsafe-diagnostics')).toEqual([]);
  });
  it('removes sibling settings and their shared parents in one run', () => {
    const text =
      'spring:\n  h2:\n    console:\n      enabled: true\n      settings:\n        web-allow-others: true\n  name: x\n';
    const { read } = run(text, 'unsafe-diagnostics');

    expect(read(YML)).toBe('spring:\n  name: x\n');
  });
  it('renames spring.profiles.active in the main document only', () => {
    const text = `${SAMPLE}---\nspring:\n  profiles:\n    active: dev\n`;
    const { read } = run(text, 'active-profile');

    expect(read(YML)).toBe(`${SAMPLE}---\nspring:\n  profiles:\n    default: dev\n`);
  });
  it('renames the key of a block list once', () => {
    const text = 'spring:\n  profiles:\n    active:\n      - dev\n      - local\n';
    const { read } = run(text, 'active-profile');

    expect(read(YML)).toBe('spring:\n  profiles:\n    default:\n      - dev\n      - local\n');
  });
  it('keeps the safe endpoints of an exposure list', () => {
    const flow = run(
      "management.endpoints.web.exposure.include: [health, 'env', info]\n",
      'actuator-exposure',
    );
    const scalar = run(
      'management:\n  endpoints:\n    web:\n      exposure:\n        include: health,env,info\n',
      'actuator-exposure',
    );

    expect(flow.read(YML)).toBe('management.endpoints.web.exposure.include: [health, info]\n');
    expect(scalar.read(YML)).toBe(
      'management:\n  endpoints:\n    web:\n      exposure:\n        include: health,info\n',
    );
  });
  it('narrows a block list to its safe items, or to health when none is left', () => {
    const prefix = 'management:\n  endpoints:\n    web:\n      exposure:\n        include:\n';
    const some = run(
      `${prefix}          - health\n          - "*"\n          - env\n`,
      'actuator-exposure',
    );
    const none = run(`${prefix}          - "*"\n          - env\n`, 'actuator-exposure');

    expect(some.read(YML)).toBe(`${prefix}          - health\n`);
    expect(none.read(YML)).toBe(`${prefix}          - "health"\n`);
  });
  it('adds open-in-view under an existing spring and jpa tree', () => {
    const jpa = run('spring:\n  jpa:\n    show-sql: false\n  name: x\n', 'open-in-view');
    const spring = run('spring:\n  name: x\nserver:\n  port: 1\n', 'open-in-view');
    const none = run('server:\n  port: 1\n', 'open-in-view');

    expect(jpa.read(YML)).toBe(
      'spring:\n  jpa:\n    open-in-view: false\n    show-sql: false\n  name: x\n',
    );
    expect(spring.read(YML)).toBe(
      'spring:\n  name: x\n  jpa:\n    open-in-view: false\nserver:\n  port: 1\n',
    );
    expect(none.read(YML)).toBe('server:\n  port: 1\nspring:\n  jpa:\n    open-in-view: false\n');
    expect(none.remaining('open-in-view')).toEqual([]);
  });
  it('adds open-in-view to the first document of a multi-document file', () => {
    const text =
      'server:\n  port: 1\n---\nspring:\n  config:\n    activate:\n      on-profile: prod\n';
    const { read } = run(text, 'open-in-view');

    expect(read(YML)).toBe(
      `server:\n  port: 1\nspring:\n  jpa:\n    open-in-view: false\n---\nspring:\n  config:\n    activate:\n      on-profile: prod\n`,
    );
  });
  it('edits application.yaml in the config folder and keeps CRLF', () => {
    const name = 'src/main/resources/config/application.yaml';
    const text = 'spring:\r\n  main:\r\n    lazy-initialization: true\r\n  name: x\r\n';
    const { read } = springFix({ files: { [name]: text }, rule: 'risky-startup-flags' });

    expect(read(name)).toBe('spring:\r\n  name: x\r\n');
  });
  it('names a setting it cannot edit and leaves the file alone', () => {
    const text = 'management: {endpoints: {web: {exposure: {include: "*"}}}}\n';
    const { read, result } = run(text, 'actuator-exposure');

    expect(read(YML)).toBe(text);
    expect(result.notes).toEqual([
      `${YML}:1 spring/actuator-exposure: left as is, its layout is not one --fix edits, change it by hand`,
    ]);
  });
  it('leaves a credential in a URL and names it', () => {
    const text = 'spring:\n  datasource:\n    url: jdbc:postgresql://bob:hunter2@db/shop\n';
    const { read, result } = run(text, 'literal-secret');

    expect(read(YML)).toBe(text);
    expect(result.notes).toEqual([
      `${YML}:3 spring/literal-secret: left as is, the credential sits inside a URL; move it into a placeholder by hand`,
    ]);
  });
});
