import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectJavaFindings as untypedCollectJavaFindings } from '../../java-diff.mjs';

type Build = 'gradle' | 'maven';
type UnboundFinding = {
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly location?: { readonly line?: number };
};

const collectJavaFindings: (root: string, options?: object) => UnboundFinding[] =
  untypedCollectJavaFindings;

const FIXTURE = path.resolve(import.meta.dirname, '../../fixtures/spring-unbound-project');
const BUILD_FILES: Readonly<Record<Build, readonly string[]>> = {
  gradle: ['build.gradle.kts', 'settings.gradle.kts'],
  maven: ['pom.xml'],
};

export const UNBOUND_FINDINGS = [
  'src/main/resources/application.yml:16 shop.mail.retry.maxatempts',
  'src/main/resources/application.yml:19 shop.pricing.curency',
  'src/main/resources/application.yml:6 spring.datasource.user',
  'src/main/resources/application.yml:8 spring.redis.host',
  'src/test/java/shop/MailOverrides.java:12 server.adress',
  'src/test/java/shop/MailOverrides.java:17 spring.datasource.urll',
  'src/test/java/shop/MailOverrides.java:8 shop.mail.retry.maxatempts',
  'src/test/java/shop/MailOverrides.java:9 spring.datasource.passwrd',
  'src/test/kotlin/shop/PricingOverrides.kt:6 shop.pricing.curency',
  'src/test/kotlin/shop/PricingOverrides.kt:9 shop.pricing.currncy',
  'src/test/resources/application-test.properties:2 server.prot',
];

function copyFixture(roots: string[], build: Build): string {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-unbound-${build}-`));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  const other = build === 'gradle' ? 'maven' : 'gradle';
  for (const file of BUILD_FILES[other]) {
    rmSync(path.join(root, file));
  }
  return root;
}

export function unboundProjects(): {
  readonly findings: (build: Build, options?: object) => string[];
  readonly remove: () => void;
} {
  const roots: string[] = [];
  return {
    findings: (build, options) =>
      collectJavaFindings(copyFixture(roots, build), options)
        .filter(({ rule }) => rule === 'unbound-property')
        .map(
          ({ path: file, location, identity }) => `${file}:${String(location?.line)} ${identity}`,
        )
        .sort(),
    remove: () => {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}
