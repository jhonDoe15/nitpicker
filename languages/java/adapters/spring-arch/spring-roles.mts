import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { configError } from '../../../../shared/config.mjs';
import { suggestionOrAllowed } from '../../../../shared/messages/closest-match.mjs';
import { validateJvmSection } from '../settings/jvm-section.mjs';
import { fieldOf, isPlainObject, textOf, textsOf } from '../../../../shared/values/readers.mts';

export const SPRING_ROLES = ['controller', 'service', 'repository'];
const ROLES_KEY = 'roles';
export const SPRING_KEYS = [ROLES_KEY];
const ROLES_FILE = 'spring-roles.txt';
export const BINARY_NAME = /^[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)+$/u;

export function validateSpringOptions(config: unknown): void {
  const spring: unknown = validateJvmSection(config, 'spring', SPRING_KEYS);
  if (spring !== undefined) {
    validateRoles(fieldOf(spring, ROLES_KEY));
  }
}

function validateRoles(roles: unknown): void {
  if (roles === undefined) {
    return;
  }
  if (!isPlainObject(roles)) {
    throw configError('"spring.roles" must be an object keyed by role');
  }
  for (const [role, names] of Object.entries(roles)) {
    if (!SPRING_ROLES.includes(role)) {
      throw configError(
        `unknown role "spring.roles.${role}"${suggestionOrAllowed(role, SPRING_ROLES, 'Roles')}`,
      );
    }
    if (!(Array.isArray(names) && names.every((name) => BINARY_NAME.test(textOf(name))))) {
      throw configError(
        `"spring.roles.${role}" must be an array of binary annotation or type names, such as "com.example.UseCase" or "com.example.Roles$UseCase" for a nested type`,
      );
    }
  }
}

export function springRolesFact(config: unknown): { springRoles?: unknown } {
  const roles = fieldOf(fieldOf(config, 'spring'), ROLES_KEY);
  return roles === undefined ? {} : { springRoles: roles };
}

export function writeSpringRoles(springRoles: unknown, directory: string): string | undefined {
  if (springRoles === undefined) {
    return undefined;
  }
  const lines = SPRING_ROLES.flatMap((role) =>
    textsOf(fieldOf(springRoles, role)).map((name) => `${role}=${name}`),
  );
  const file = path.join(directory, ROLES_FILE);
  writeFileSync(file, lines.map((line) => `${line}\n`).join(''));
  return file;
}
