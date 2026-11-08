import { afterEach, describe, expect, it } from 'vitest';
import { readSpringConfigFindings } from '../java-spring.mjs';
import { judgedKey } from './unbound-keys.mjs';
import { problemsIn, removeProjects, writeProject } from './test-support/unbound-project.mjs';

const YAML = 'src/main/resources/application.yml';
const PROPERTIES = 'src/main/resources/application.properties';

afterEach(removeProjects);

describe('spring/unbound-property in configuration files', () => {
  it('reports a misspelled key under a group the metadata owns, with the nearest known key', () => {
    expect(
      problemsIn({
        [PROPERTIES]: [
          'spring.datasource.url=jdbc:h2:mem:shop',
          'spring.datasource.user=sa',
          'server.prot=8080',
          'spring.datasource.hikari.maximum-pool-sizes=4',
        ].join('\n'),
      }),
    ).toEqual([
      `${PROPERTIES}:2 spring.datasource.user binds to no property, so Spring ignores it; did you mean spring.datasource.username?`,
      `${PROPERTIES}:3 server.prot binds to no property, so Spring ignores it; did you mean server.port?`,
      `${PROPERTIES}:4 spring.datasource.hikari.maximum-pool-sizes binds to no property, so Spring ignores it; did you mean spring.datasource.hikari.maximum-pool-size?`,
    ]);
  });

  it('names the replacement of a key the metadata marks as removed, and accepts a deprecated one that still binds', () => {
    expect(
      problemsIn({
        [YAML]: [
          'spring:',
          '  redis:',
          '    host: cache',
          '    data:',
          '      user: app',
          'server.max-http-header-size: 8KB',
        ].join('\n'),
      }),
    ).toEqual([
      `${YAML}:3 spring.redis.host was removed from Spring Boot and binds to nothing; use spring.data.redis.host.`,
      `${YAML}:5 spring.redis.data.user binds to no property, so Spring ignores it; did you mean spring.data.redis.username?`,
    ]);
  });

  it('accepts relaxed spellings, list indexes, map entries and the keys Spring derives from endpoint ids', () => {
    expect(
      problemsIn({
        [PROPERTIES]: [
          'spring.datasource.hikari.maximumPoolSize=4',
          'SPRING_DATASOURCE_URL=jdbc:h2:mem:shop',
          'spring.jpa.open_in_view=false',
          'spring.profiles.active[0]=prod',
          'spring.jpa.properties.hibernate.format_sql=true',
          'logging.level.[org.hibernate.SQL]=debug',
          'management.endpoints.web.exposure.include=health,info',
          'management.endpoint.orders.access=read-only',
          'management.health.inventory.enabled=false',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('leaves keys under a prefix nobody describes alone, but reports a near miss of a known segment', () => {
    expect(
      problemsIn({
        [PROPERTIES]: [
          'acme.client.timeout=5s',
          'spring.output.ansi.console-available=true',
          'spring.datsource.url=jdbc:h2:mem:shop',
          'servers.port=1',
          'app.queue1.name=a',
        ].join('\n'),
      }),
    ).toEqual([
      `${PROPERTIES}:3 spring.datsource.url binds to no property, so Spring ignores it; did you mean spring.datasource.url?`,
    ]);
  });

  it('reads test resources and profile documents too', () => {
    expect(
      problemsIn({
        'src/test/resources/application-test.yml': 'server:\n  portt: 0\n',
        [YAML]: [
          'server:',
          '  port: 8080',
          '---',
          'spring.config.activate.on-profile: dev',
          'server.adress: ::1',
        ].join('\n'),
      }),
    ).toEqual([
      `${YAML}:5 server.adress binds to no property, so Spring ignores it; did you mean server.address?`,
      'src/test/resources/application-test.yml:2 server.portt binds to no property, so Spring ignores it; did you mean server.port?',
    ]);
  });

  it('runs only on Spring Boot projects', () => {
    const files = { [PROPERTIES]: 'server.prot=8080\n' };
    expect(problemsIn(files, { jarName: 'spring-context-6.2.10.jar' })).toEqual([]);
    expect(problemsIn(files, { classpath: [] })).toEqual([]);
  });
});

describe('known keys from the project', () => {
  it('reads metadata the project declares itself and keys its code reads by name', () => {
    expect(
      problemsIn({
        'src/main/resources/META-INF/additional-spring-configuration-metadata.json': JSON.stringify(
          {
            properties: [{ name: 'server.tracing-header', type: 'java.lang.String' }],
          },
        ),
        'src/main/java/shop/Clock.java': [
          'class Clock {',
          '  @Value("${server.zone:UTC}") String zone;',
          '  String drift(Environment environment) { return environment.getProperty("server.drift"); }',
          '  String any(Environment environment, String name) { return environment.getProperty("server.extra." + name); }',
          '  Settings bound(Binder binder) { return binder.bind("server.custom", Settings.class).get(); }',
          '}',
        ].join('\n'),
        'src/main/kotlin/shop/Feature.kt': [
          '@ConditionalOnProperty(prefix = "server.feature", name = ["enabled", "mode"])',
          'class Feature',
          '@ConditionalOnProperty("server.legacy")',
          'class Legacy',
        ].join('\n'),
        'src/main/resources/logback-spring.xml':
          '<springProperty name="LEVEL" source="server.log-level"/>',
        [PROPERTIES]: [
          'server.tracing-header=x-trace',
          'server.zone=UTC',
          'server.drift=5s',
          'server.extra.anything=1',
          'server.custom.depth=2',
          'server.feature.enabled=true',
          'server.feature.mode=fast',
          'server.legacy=false',
          'server.log-level=info',
          'app.sql-dir=${server.home}/sql',
          'server.home=/opt',
          'server.unread=1',
        ].join('\n'),
      }),
    ).toEqual([
      `${PROPERTIES}:12 server.unread binds to no property, so Spring ignores it; use a key that the server properties define.`,
    ]);
  });
});

describe('judgedKey', () => {
  it('compares the relaxed key up to the first map-key bracket', () => {
    expect(judgedKey(' Spring.Data_Redis.host-Name ')).toBe('spring.dataredis.hostname');
    expect(judgedKey('logging.level.[org.hibernate.SQL]')).toBe('logging.level');
    expect(judgedKey('spring.profiles.active[1]')).toBe('spring.profiles.active');
    expect(judgedKey('server.servlet.context-parameters./x')).toBe(
      'server.servlet.contextparameters',
    );
  });
});

describe('readSpringConfigFindings', () => {
  it('reports unbound-property findings with the exception route and the relaxed key as identity', () => {
    const { root, jar } = writeProject({ [PROPERTIES]: 'server.prot=8080\n' });
    const [finding] = readSpringConfigFindings(root, {
      sourceRoots: ['src/main/java'],
      classpath: [jar],
    }).filter(({ rule }) => rule === 'unbound-property');
    expect(finding).toMatchObject({
      tool: 'spring',
      path: PROPERTIES,
      identity: 'server.prot',
      location: { line: 1 },
    });
    expect(finding.message).toContain(
      '{"rule":"spring/unbound-property","paths":["src/main/resources/application.properties"]',
    );
  });
});
