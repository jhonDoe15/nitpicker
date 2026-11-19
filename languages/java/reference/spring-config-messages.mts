import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adviceOf } from './typed/entry-views.mts';
import { readSpringConfigFindings, SPRING_CONFIG_RULES } from '../adapters/spring/java-spring.mts';
import { relaxKey } from '../adapters/spring/spring-config-parser.mts';

type SpringFinding = { rule: string; identity: string; message: string };
export type SpringForm = { label: string; message: string };

const readFindings: (
  root: string,
  options: { sourceRoots: string[]; springClasspath: string[] },
) => SpringFinding[] = readSpringConfigFindings;
const springRules: readonly string[] = SPRING_CONFIG_RULES;
const relaxedKey: (key: string) => string = relaxKey;

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
  'spring.datasource.user=app',
  'spring.redis.host=cache',
];
const SAMPLE_METADATA = {
  groups: [{ name: 'spring.datasource' }],
  properties: [
    { name: 'spring.datasource.url', type: 'java.lang.String' },
    { name: 'spring.datasource.username', type: 'java.lang.String' },
    { name: 'spring.datasource.password', type: 'java.lang.String' },
    {
      name: 'spring.redis.host',
      deprecation: { level: 'error', replacement: 'spring.data.redis.host' },
    },
  ],
};

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

const SAMPLE_CONTROLLER = [
  'package example;',
  '@Controller',
  'public class SampleController {',
  '  @GetMapping("/owners")',
  '  String find(Owner owner) {',
  '    owners.findByLastNameStartingWith(owner.getLastName());',
  '    return "owners";',
  '  }',
  '}',
  '',
].join('\n');

const SAMPLE_KEYS = new Map(
  SAMPLE_PROPERTIES.map((line) => line.split('=')[0] ?? '').map((key): [string, string] => [
    relaxedKey(key),
    key,
  ]),
);

function labelOf(identity: string): string {
  const key = identity.replace(/#\d+$/u, '');
  return SAMPLE_KEYS.get(key) ?? key;
}

function writeSampleProject(root: string): void {
  mkdirSync(path.join(root, 'src/main/resources'), { recursive: true });
  mkdirSync(path.join(root, 'src/main/java/example'), { recursive: true });
  writeFileSync(
    path.join(root, 'src/main/resources/application.properties'),
    `${SAMPLE_PROPERTIES.join('\n')}\n`,
  );
  writeFileSync(path.join(root, 'src/main/java/example/Sample.java'), SAMPLE_SOURCE);
  writeFileSync(path.join(root, 'src/main/java/example/SampleController.java'), SAMPLE_CONTROLLER);
  mkdirSync(path.join(root, 'classes/META-INF'), { recursive: true });
  writeFileSync(
    path.join(root, 'classes/META-INF/spring-configuration-metadata.json'),
    JSON.stringify(SAMPLE_METADATA),
  );
}

function sampleFindings(): SpringFinding[] {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-reference-spring-'));
  try {
    writeSampleProject(root);
    return readFindings(root, {
      sourceRoots: ['src/main/java'],
      springClasspath: [path.join(root, 'spring-boot-3.5.5.jar'), path.join(root, 'classes')],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function springConfigForms(): Map<string, SpringForm[]> {
  const findings = sampleFindings();
  return new Map(
    springRules.map((rule): [string, SpringForm[]] => {
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
