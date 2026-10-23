import path from 'node:path';

const SPRING_JAR = /^spring-(?:context|boot)-.*\.jar$/u;

export function usesSpring(classpaths) {
  return classpaths.mainCompile.some((entry) => SPRING_JAR.test(path.basename(entry)));
}

export function runsArchRules(classpaths) {
  return usesSpring(classpaths);
}

export function withDeclaredSpring(manifest, declared) {
  const spring = declared === true || manifest.spring;
  return { ...manifest, spring, springArch: spring || manifest.springArch };
}

export function withFeatureFolders(manifest, featureFolders) {
  return { ...manifest, springArch: manifest.springArch || featureFolders === true };
}

export function buildRunsArchRules(policy, analyzed) {
  return (
    policy.spring === true ||
    policy.featureFolders === true ||
    analyzed.some(({ classpaths }) => runsArchRules(classpaths))
  );
}

export function springFacts(classpaths) {
  return { spring: usesSpring(classpaths), springArch: runsArchRules(classpaths) };
}
