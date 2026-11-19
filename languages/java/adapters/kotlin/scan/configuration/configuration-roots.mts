import { escapeRegExp } from '../typed/typed-scan.mts';
import { isCompositionRoot } from '../kotlin-source.mts';
import type { Scanned } from '../typed/scan-shapes.mts';

const ROOT_TYPES = [
  'org.springframework.context.annotation.Configuration',
  'org.springframework.boot.autoconfigure.AutoConfiguration',
  'org.springframework.boot.env.EnvironmentPostProcessor',
  'org.springframework.context.ApplicationContextInitializer',
  'io.micronaut.context.annotation.Factory',
  'io.micronaut.context.annotation.ConfigurationProperties',
  'io.quarkus.runtime.QuarkusApplication',
  'io.quarkus.runtime.annotations.QuarkusMain',
  'dagger.Module',
  'dagger.Provides',
  'com.google.inject.AbstractModule',
  'com.google.inject.Module',
  'com.google.inject.Provides',
  'jakarta.enterprise.inject.Produces',
  'javax.enterprise.inject.Produces',
];

function usePattern(qualified: string): (code: string) => boolean {
  const name = escapeRegExp(qualified.split('.').at(-1) ?? '');
  const imported = new RegExp(`^[ \\t]*import[ \\t]+${escapeRegExp(qualified)}[ \\t]*$`, 'mu');
  const used = new RegExp(
    `@${name}\\b|(?:\\)|\\bclass\\s+\\w+|\\bobject\\s+\\w+)\\s*:[^{=]*?(?<![\\w.])${name}\\b`,
    'u',
  );
  const qualifiedUse = new RegExp(
    `@${escapeRegExp(qualified)}\\b|:[^{=]*?(?<![\\w.])${escapeRegExp(qualified)}\\b`,
    'u',
  );
  return (code: string) => (imported.test(code) && used.test(code)) || qualifiedUse.test(code);
}

const ROOT_USES = ROOT_TYPES.map(usePattern);

export function isConfigurationRoot(scanned: Scanned): boolean {
  return isCompositionRoot(scanned) || ROOT_USES.some((uses) => uses(scanned.code));
}
