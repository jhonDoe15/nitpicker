import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adviceOf } from '../../../shared/reference/build/messages.mjs';
import { readSpringConfigFindings, SPRING_CONFIG_RULES } from '../adapters/spring/java-spring.mjs';
import { relaxKey } from '../adapters/spring/spring-config-parser.mjs';

const SAMPLE_PROPERTIES = [
  'spring.jpa.open-in-view=true',
  'spring.jpa.hibernate.ddl-auto=update',
  'spring.jpa.generate-ddl=true',
  'spring.main.allow-circular-references=true',
  'management.endpoints.web.exposure.include=*',
  'management.endpoints.access.default=unrestricted',
  'management.endpoint.heapdump.access=unrestricted',
  'management.endpoint.shutdown.enabled=true',
  'server.error.include-stacktrace=always',
  'server.error.include-message=always',
  'server.error.include-binding-errors=always',
  'server.error.include-exception=true',
  'spring.jpa.show-sql=true',
  'logging.level.org.hibernate.orm.jdbc.bind=trace',
  'spring.h2.console.enabled=true',
  'management.endpoint.env.show-values=always',
  'spring.profiles.active=production',
  'spring.profiles.include=extra',
  'spring.datasource.password=example-value',
  'app.client.token=${CLIENT_TOKEN:example-value}',
  'spring.datasource.url=jdbc:postgresql://user:example-value@database/app',
];

const SAMPLE_SOURCE = [
  'package example;',
  'import jakarta.persistence.Entity;',
  'import org.springframework.scheduling.annotation.Scheduled;',
  '@Entity',
  'public class Sample {',
  '  @Scheduled(fixedDelay = 1000)',
  '  void run() {}',
  '}',
  '',
].join('\n');

const SAMPLE_KEYS = new Map(
  SAMPLE_PROPERTIES.map((line) => line.split('=')[0]).map((key) => [relaxKey(key), key]),
);

function labelOf(identity) {
  const key = identity.replace(/#\d+$/u, '');
  return SAMPLE_KEYS.get(key) ?? key;
}

function writeSampleProject(root) {
  mkdirSync(path.join(root, 'src/main/resources'), { recursive: true });
  mkdirSync(path.join(root, 'src/main/java/example'), { recursive: true });
  writeFileSync(
    path.join(root, 'src/main/resources/application.properties'),
    `${SAMPLE_PROPERTIES.join('\n')}\n`,
  );
  writeFileSync(path.join(root, 'src/main/java/example/Sample.java'), SAMPLE_SOURCE);
}

function sampleFindings() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-reference-spring-'));
  try {
    writeSampleProject(root);
    return readSpringConfigFindings(root, { sourceRoots: ['src/main/java'] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * The messages each Spring configuration rule prints for a sample project that breaks it every
 * way, as `forms` by rule, each labelled with the setting or annotation it names.
 */
export function springConfigForms() {
  const findings = sampleFindings();
  return new Map(
    SPRING_CONFIG_RULES.map((rule) => {
      const forms = findings
        .filter((finding) => finding.rule === rule)
        .map(({ identity, message }) => ({
          label: labelOf(identity),
          message: adviceOf(message),
        }));
      if (forms.length === 0) {
        throw new Error(`The sample Spring project gives no finding of spring/${rule}`);
      }
      return [
        rule,
        forms.filter(
          (form, index) => forms.findIndex((other) => other.message === form.message) === index,
        ),
      ];
    }),
  );
}
