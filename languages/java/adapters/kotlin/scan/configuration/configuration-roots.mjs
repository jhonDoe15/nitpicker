import { isCompositionRoot } from '../kotlin-source.mjs';

const ROOT_TYPES = [
  'org\\.springframework\\.context\\.annotation\\.Configuration',
  'org\\.springframework\\.boot\\.autoconfigure\\.AutoConfiguration',
  'org\\.springframework\\.boot\\.env\\.EnvironmentPostProcessor',
  'org\\.springframework\\.context\\.ApplicationContextInitializer',
  'io\\.micronaut\\.context\\.annotation\\.(?:Factory|ConfigurationProperties)',
  'io\\.quarkus\\.runtime\\.(?:QuarkusApplication|annotations\\.QuarkusMain)',
  'dagger\\.Module',
  'com\\.google\\.inject\\.(?:AbstractModule|Module)',
  '(?:jakarta|javax)\\.enterprise\\.inject\\.Produces',
];
const ROOT_TYPE = new RegExp(`(?<![\\w.])(?:${ROOT_TYPES.join('|')})(?![\\w.])`, 'u');

export function isConfigurationRoot(scanned) {
  return isCompositionRoot(scanned) || ROOT_TYPE.test(scanned.code);
}
