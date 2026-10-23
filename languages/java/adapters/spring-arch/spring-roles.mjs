import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_PRESETS } from '../gradle-presets.mjs';
import { configError, isPlainObject } from '../../../../shared/config.mjs';

const SPRING_ROLES = ['controller', 'service', 'repository'];
const SPRING_KEYS = ['roles'];
const ROLES_FILE = 'spring-roles.txt';
const BINARY_NAME = /^[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)+$/u;

export function validateSpringOptions(config) {
  const { spring } = config;
  if (spring === undefined) {
    return;
  }
  if (!GRADLE_PRESETS.includes(config.preset)) {
    throw configError(
      `"spring" is only supported with ${GRADLE_PRESETS.map((preset) => `"preset": "${preset}"`).join(' or ')}`,
    );
  }
  if (!isPlainObject(spring)) {
    throw configError('"spring" must be an object');
  }
  for (const key of Object.keys(spring)) {
    if (!SPRING_KEYS.includes(key)) {
      throw configError(`unknown key "spring.${key}". Allowed keys: ${SPRING_KEYS.join(', ')}`);
    }
  }
  validateRoles(spring.roles);
}

function validateRoles(roles) {
  if (roles === undefined) {
    return;
  }
  if (!isPlainObject(roles)) {
    throw configError('"spring.roles" must be an object keyed by role');
  }
  for (const [role, names] of Object.entries(roles)) {
    if (!SPRING_ROLES.includes(role)) {
      throw configError(`unknown role "spring.roles.${role}". Roles: ${SPRING_ROLES.join(', ')}`);
    }
    if (!Array.isArray(names) || !names.every((name) => BINARY_NAME.test(name))) {
      throw configError(
        `"spring.roles.${role}" must be an array of binary annotation or type names, such as "com.example.UseCase" or "com.example.Roles$UseCase" for a nested type`,
      );
    }
  }
}

export function springRolesFact(config) {
  const roles = config.spring?.roles;
  return roles === undefined ? {} : { springRoles: roles };
}

export function writeSpringRoles(springRoles, directory) {
  if (springRoles === undefined) {
    return undefined;
  }
  const lines = SPRING_ROLES.flatMap((role) =>
    (springRoles[role] ?? []).map((name) => `${role}=${name}`),
  );
  const file = path.join(directory, ROLES_FILE);
  writeFileSync(file, lines.map((line) => `${line}\n`).join(''));
  return file;
}
