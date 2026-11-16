import path from 'node:path';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';

type Manifest = Readonly<Record<string, unknown>>;

const SPRING_JAR = /^spring-(?:context|boot)-.*\.jar$/u;
const JMOLECULES_JAR = /^jmolecules-ddd-.*\.jar$/u;
const AOT_TESTS = /^-Dspring\.aot\.enabled=true$/iu;

function onMainCompile(classpaths: unknown, jar: RegExp): boolean {
  return textsOf(fieldOf(classpaths, 'mainCompile')).some((entry) =>
    jar.test(path.basename(entry)),
  );
}

export function usesSpring(classpaths: unknown): boolean {
  return onMainCompile(classpaths, SPRING_JAR);
}

export function runsArchRules(classpaths: unknown): boolean {
  return usesSpring(classpaths) || onMainCompile(classpaths, JMOLECULES_JAR);
}

export function withDeclaredSpring(manifest: Manifest, declared: unknown): Manifest {
  const spring = declared === true || manifest['spring'] === true;
  return { ...manifest, spring, springArch: spring || manifest['springArch'] === true };
}

export function withFeatureFolders(manifest: Manifest, featureFolders: unknown): Manifest {
  return { ...manifest, springArch: manifest['springArch'] === true || featureFolders === true };
}

export function buildRunsArchRules(policy: unknown, analyzed: readonly unknown[]): boolean {
  return (
    fieldOf(policy, 'spring') === true ||
    fieldOf(policy, 'featureFolders') === true ||
    analyzed.some((module) => runsArchRules(fieldOf(module, 'classpaths')))
  );
}

export function springFacts(classpaths: unknown): { spring: boolean; springArch: boolean } {
  return { spring: usesSpring(classpaths), springArch: runsArchRules(classpaths) };
}

export function springAotSkip(modules: readonly unknown[]): string[] {
  return modules.some((module) =>
    [
      ...textsOf(fieldOf(module, 'testJvmArgs')),
      ...textsOf(fieldOf(module, 'integrationTestJvmArgs')),
    ].some((argument) => AOT_TESTS.test(argument)),
  )
    ? []
    : ['-Dspring-boot.aot.skip=true'];
}
