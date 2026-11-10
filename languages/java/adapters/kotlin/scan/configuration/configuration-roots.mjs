import { isCompositionRoot } from '../kotlin-source.mjs';

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

function escaped(text) {
  return text.replaceAll('.', '\\.');
}

function usePattern(qualified) {
  const name = escaped(qualified.split('.').at(-1));
  const imported = new RegExp(`^[ \\t]*import[ \\t]+${escaped(qualified)}[ \\t]*$`, 'mu');
  const used = new RegExp(
    `@${name}\\b|(?:\\)|\\bclass\\s+\\w+|\\bobject\\s+\\w+)\\s*:[^{=]*?(?<![\\w.])${name}\\b`,
    'u',
  );
  const qualifiedUse = new RegExp(
    `@${escaped(qualified)}\\b|:[^{=]*?(?<![\\w.])${escaped(qualified)}\\b`,
    'u',
  );
  return (code) => (imported.test(code) && used.test(code)) || qualifiedUse.test(code);
}

const ROOT_USES = ROOT_TYPES.map(usePattern);

export function isConfigurationRoot(scanned) {
  return isCompositionRoot(scanned) || ROOT_USES.some((uses) => uses(scanned.code));
}
