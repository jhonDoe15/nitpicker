import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../../../core/configuration/validate.mts';
import { readRunnerPolicy } from '../java-runner.mts';
import { gradleStages } from '../gradle-wrapper/gradle-stages.mts';
import { springRolesFact, writeSpringRoles } from './spring-roles.mts';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';

const { temporaryRoot } = useGitFixtures();

const ROLES = { service: ['com.acme.UseCase', 'com.acme.Job'], controller: ['com.acme.Endpoint'] };
function temporaryDirectory(): string {
  const directory = temporaryRoot('nitpicker-spring-roles-');
  return directory;
}

describe('Spring role mappings', () => {
  it.each(['java', 'kotlin'])(
    'accepts roles mapped to fully qualified names on the %s preset',
    (preset) => {
      expect(() => validateConfig({ preset, spring: { roles: ROLES } })).not.toThrow();
    },
  );

  it.each([
    [
      { preset: 'typescript', spring: { roles: ROLES } },
      '"spring" is only supported with "preset": "java" or "preset": "kotlin"',
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
      { preset: 'java', spring: { roles: { controler: ['com.acme.Api'] } } },
      'unknown role "spring.roles.controler". Did you mean "controller"?',
    ],
    [
      { preset: 'java', spring: { roles: { service: ['UseCase'] } } },
      '"spring.roles.service" must be an array of binary annotation or type names, such as "com.example.UseCase" or "com.example.Roles$UseCase" for a nested type',
    ],
    [
      { preset: 'java', spring: { roles: { service: 'com.acme.UseCase' } } },
      '"spring.roles.service" must be an array of binary annotation or type names, such as "com.example.UseCase" or "com.example.Roles$UseCase" for a nested type',
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
      readRunnerPolicy(['--project-root', directory], { NITPICKER_POLICY: policyFile }).policy[
        'springRoles'
      ],
    ).toEqual(ROLES);
  });

  it('writes one role=name line per mapping and hands the file to Gradle', () => {
    const directory = temporaryDirectory();
    const file = writeSpringRoles(ROLES, directory);

    expect(readFileSync(String(file), 'utf8')).toBe(
      'controller=com.acme.Endpoint\nservice=com.acme.UseCase\nservice=com.acme.Job\n',
    );
    expect(writeSpringRoles(undefined, directory)).toBeUndefined();
    const [stage] = gradleStages([], {
      projectRoot: directory,
      initScript: 'init.gradle',
      policy: { springRoles: ROLES },
      directory: path.join(directory, 'gradle'),
      testsSkipped: false,
    });
    expect(stage?.().filter((argument) => argument.startsWith('-Pnitpicker.spring.'))).toEqual([
      `-Pnitpicker.spring.roles=${path.join(directory, 'gradle', 'spring-roles.txt')}`,
    ]);
  });
});
