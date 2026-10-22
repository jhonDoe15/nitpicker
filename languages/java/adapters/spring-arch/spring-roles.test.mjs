import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateConfig } from '../../../../core/configuration/validate.mjs';
import { readRunnerPolicy } from '../java-runner.mjs';
import { gradleStages } from '../gradle-wrapper/gradle-stages.mjs';
import { springRolesFact, writeSpringRoles } from './spring-roles.mjs';

const ROLES = { service: ['com.acme.UseCase', 'com.acme.Job'], controller: ['com.acme.Endpoint'] };
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-roles-'));
  temporaryRoots.push(directory);
  return directory;
}

describe('Spring role mappings', () => {
  it('accepts roles mapped to fully qualified names on the JVM presets', () => {
    for (const preset of ['java', 'kotlin']) {
      expect(() => validateConfig({ preset, spring: { roles: ROLES } })).not.toThrow();
    }
  });

  it.each([
    [
      { preset: 'typescript', spring: { roles: ROLES } },
      '"spring" is only supported with "preset": java or kotlin',
    ],
    [{ preset: 'java', spring: [] }, '"spring" must be an object'],
    [
      { preset: 'java', spring: { layers: {} } },
      'unknown key "spring.layers". Allowed keys: roles',
    ],
    [{ preset: 'java', spring: { roles: [] } }, '"spring.roles" must be an object keyed by role'],
    [
      { preset: 'java', spring: { roles: { usecase: ['com.acme.UseCase'] } } },
      'unknown role "spring.roles.usecase". Roles: controller, service, repository',
    ],
    [
      { preset: 'java', spring: { roles: { service: ['UseCase'] } } },
      '"spring.roles.service" must be an array of fully qualified annotation or type names, such as "com.example.UseCase"',
    ],
    [
      { preset: 'java', spring: { roles: { service: 'com.acme.UseCase' } } },
      '"spring.roles.service" must be an array of fully qualified annotation or type names',
    ],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it('accepts nested and dollar-named binary names', () => {
    expect(() =>
      validateConfig({ preset: 'java', spring: { roles: { service: ['com.acme.Outer$Inner'] } } }),
    ).not.toThrow();
  });

  it('carries the roles from the config into the head policy and the runner policy', () => {
    expect(springRolesFact({ preset: 'java', spring: { roles: ROLES } })).toEqual({
      springRoles: ROLES,
    });
    expect(springRolesFact({ preset: 'java' })).toEqual({});
    const directory = temporaryDirectory();
    const policyFile = path.join(directory, 'policy.json');
    writeFileSync(policyFile, JSON.stringify({ springRoles: ROLES }));

    expect(
      readRunnerPolicy(['--project-root', directory], { NITPICKER_POLICY: policyFile }).policy
        .springRoles,
    ).toEqual(ROLES);
  });

  it('writes one role=name line per mapping and hands the file to Gradle', () => {
    const directory = temporaryDirectory();
    const file = writeSpringRoles(ROLES, directory);

    expect(readFileSync(file, 'utf8')).toBe(
      'controller=com.acme.Endpoint\nservice=com.acme.UseCase\nservice=com.acme.Job\n',
    );
    expect(writeSpringRoles(undefined, directory)).toBeUndefined();
    const [stage] = gradleStages([], {
      projectRoot: directory,
      initScript: 'init.gradle',
      policy: { springRoles: ROLES },
      directory: path.join(directory, 'gradle'),
    });
    expect(stage().filter((argument) => argument.startsWith('-Pnitpicker.spring.'))).toEqual([
      `-Pnitpicker.spring.roles=${path.join(directory, 'gradle', 'spring-roles.txt')}`,
    ]);
  });
});
