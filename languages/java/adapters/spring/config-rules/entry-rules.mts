import { relaxKey } from '../spring-config-parser.mts';
import { credentialUrl, isLiteralSecret, secretVariable } from '../spring-secrets.mts';
import type { ConfigEntry, ConfigRule } from '../typed/config-types.mts';
import { ACTUATOR_RULE } from './actuator.mts';
import { DIAGNOSTIC_RULES } from './diagnostics.mts';
import { isPlaceholder, isTest, isTestOrLocal, isTrue } from './profiles.mts';

const DDL_MODE_NAMES = [
  'spring.jpa.hibernate.ddl-auto',
  'spring.jpa.properties.hibernate.hbm2ddl.auto',
];
const DDL_MODES = new Set(DDL_MODE_NAMES.map(relaxKey));
const GENERATE_DDL = relaxKey('spring.jpa.generate-ddl');
const STARTUP_FLAG_NAMES = [
  'spring.main.allow-circular-references',
  'spring.main.allow-bean-definition-overriding',
  'spring.main.lazy-initialization',
];
const STARTUP_FLAGS = new Set(STARTUP_FLAG_NAMES.map(relaxKey));
export const ENTRY_RULES: ConfigRule[] = [
  {
    rule: 'ddl-auto',
    exempt: isTestOrLocal,
    problem: ddlProblem,
  },
  {
    rule: 'risky-startup-flags',
    exempt: isTest,
    problem: (entry, key) =>
      STARTUP_FLAGS.has(key) && isTrue(entry)
        ? `Remove ${displayName(key, STARTUP_FLAG_NAMES)}=true and restructure the beans; the flag hides wiring problems instead of fixing them.`
        : undefined,
  },
  ACTUATOR_RULE,
  ...DIAGNOSTIC_RULES,
  {
    rule: 'literal-secret',
    exempt: isTestOrLocal,
    problem: (entry) =>
      isLiteralSecret(entry.key, entry.value) ? secretProblem(entry) : urlProblem(entry),
  },
];

function secretProblem(entry: ConfigEntry): string {
  return entry.value.trim().startsWith('${')
    ? `Drop the default from the placeholder of ${entry.key}, so a missing secret fails at startup; it falls back to a literal secret.`
    : `Set ${secretVariable(entry.key)} in the environment, or read it from a secret store, and remove the literal secret from ${entry.key}.`;
}

function urlProblem(entry: ConfigEntry): string | undefined {
  return credentialUrl(entry.value)
    ? `Supply the credential in ${entry.key} from the environment, for example through a placeholder without a default, and take it out of the URL.`
    : undefined;
}

function ddlProblem(entry: ConfigEntry, key: string): string | undefined {
  if (isPlaceholder(entry)) {
    return undefined;
  }
  if (DDL_MODES.has(key)) {
    const mode = entry.value.toLowerCase();
    return mode !== '' && mode !== 'none' && mode !== 'validate'
      ? `Manage the schema with Flyway or Liquibase and set ${displayName(key, DDL_MODE_NAMES)} to none or validate; other modes let Hibernate change the schema.`
      : undefined;
  }
  return key === GENERATE_DDL && isTrue(entry)
    ? 'Manage the schema with Flyway or Liquibase and keep spring.jpa.generate-ddl false; true lets Hibernate change the schema.'
    : undefined;
}

function displayName(key: string, names: readonly string[]): string {
  return names.find((name) => relaxKey(name) === key) ?? key;
}
