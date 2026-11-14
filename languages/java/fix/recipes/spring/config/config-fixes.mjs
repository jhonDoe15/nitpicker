import { isSensitiveEndpoint } from '../../../../adapters/spring/config-rules/actuator.mjs';
import { stripBracketsAndQuotes } from '../../../../adapters/spring/spring-config-files.mjs';
import { relaxKey } from '../../../../adapters/spring/spring-config-parser.mjs';
import {
  isLiteralSecret,
  placeholderDefault,
  secretVariable,
} from '../../../../adapters/spring/spring-secrets.mjs';

const DISABLED = 'false';
const GENERATE_DDL = relaxKey('spring.jpa.generate-ddl');
const INCLUDE_EXCEPTION = relaxKey('server.error.include-exception');
const EXPOSURE = relaxKey('management.endpoints.web.exposure.include');
const DEFAULT_ACCESS = relaxKey('management.endpoints.access.default');
const ACTIVE = relaxKey('spring.profiles.active');
const VARIABLE = /^[A-Z][A-Z0-9_]*$/;

const OPENER = /\$\{[^}:]*:/gy;

function openers(value) {
  const found = [...value.matchAll(OPENER)].map(([text]) => text);
  const closers = found.length;
  return value.endsWith('}'.repeat(closers)) ? found : [];
}

function withDefault(value, replacement) {
  const found = openers(value);
  return found.length === 0
    ? replacement
    : `${found.join('')}${replacement}${'}'.repeat(found.length)}`;
}

function withoutDefault(value) {
  const found = openers(value);
  if (found.length === 0) {
    return value;
  }
  const last = found.at(-1);
  const kept = found.slice(0, -1).join('');
  return `${kept}${last.slice(0, -1)}}${'}'.repeat(found.length - 1)}`;
}

export function isOffending(item) {
  const name = item.trim().toLowerCase();
  return name === '*' || isSensitiveEndpoint(name);
}

export function exposureItems(value) {
  return stripBracketsAndQuotes(value)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function value(to) {
  return { kind: 'value', to: (old) => withDefault(old, to) };
}

function actuatorOperation(key) {
  if (key === EXPOSURE) {
    return { kind: 'narrow' };
  }
  if (key === DEFAULT_ACCESS) {
    return value('read-only');
  }
  return key.endsWith('.access') ? value('none') : { kind: 'remove' };
}

function secretOperation(entry) {
  if (!isLiteralSecret(entry.key, entry.value)) {
    return { skip: 'the credential sits inside a URL; move it into a placeholder by hand' };
  }
  const name = secretVariable(entry.key);
  if (entry.value.trim().startsWith('${')) {
    return { kind: 'value', to: withoutDefault };
  }
  return VARIABLE.test(name)
    ? { kind: 'value', to: () => `\${${name}}` }
    : { skip: `${name} is not a usable environment variable name` };
}

function profileOperation(key) {
  return key === ACTIVE
    ? { kind: 'rename', from: 'active', to: 'default' }
    : { skip: 'name the profiles in a spring.profiles.group entry by hand' };
}

export function operationFor({ rule, entry }) {
  if (entry === undefined) {
    return { kind: 'insert' };
  }
  const key = relaxKey(entry.key);
  const effective = placeholderDefault(entry.value.trim()).toLowerCase();
  switch (rule) {
    case 'ddl-auto':
      return value(key === GENERATE_DDL ? DISABLED : 'validate');
    case 'open-in-view':
      return value(DISABLED);
    case 'error-details':
      return value(key === INCLUDE_EXCEPTION ? DISABLED : 'never');
    case 'actuator-exposure':
      return actuatorOperation(key);
    case 'unsafe-diagnostics':
      return effective === 'always' ? value('when-authorized') : { kind: 'remove' };
    case 'literal-secret':
      return secretOperation(entry);
    case 'active-profile':
      return profileOperation(key);
    default:
      return { kind: 'remove' };
  }
}
