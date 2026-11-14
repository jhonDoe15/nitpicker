import { describe, expect, it } from 'vitest';
import { resolveProjectRoot } from '../../configuration/project-checks/project-root.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { noProjectAdvice } from './suggested-projects.mjs';

const git = useGitFixtures();

function failureAt(files, folder = '') {
  const { root } = git.createGitRepository(files, { prefix: 'nitpicker-suggest-' });
  try {
    resolveProjectRoot(`${root}/${folder}`, { noProjectAdvice });
  } catch (error) {
    return error.message.replaceAll(root, '<root>').split(' See ')[0];
  }
  throw new Error('expected no project');
}

const SERVICES = {
  'services/orders/pom.xml': '<project/>\n',
  'services/orders/src/main/java/Orders.java': 'class Orders {}\n',
  'services/users/build.gradle': "plugins { id 'java' }\n",
  'services/users/src/main/java/Users.java': 'class Users {}\n',
  'web/package.json': '{"name":"web","version":"1.0.0"}\n',
  'web/src/index.ts': 'export {};\n',
};

describe('a repository whose top folder is no project', () => {
  it('prints the projects list it would use for a multi-service repository', () => {
    expect(failureAt(SERVICES)).toBe(
      'No package.json or nitpicker.config.json found in the repository root <root>. ' +
        'The repository holds projects of its own: services/orders (Maven build), ' +
        'services/users (Gradle build), web (TypeScript package). To gate each in one run, ' +
        'create nitpicker.config.json at the repository root with {"projects": [' +
        '{"path": "services/orders", "preset": "java"}, {"path": "services/users", "preset": "java"}, ' +
        '{"path": "web", "preset": "typescript"}]}.',
    );
  });

  it('lists ten projects and counts the rest', () => {
    const files = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `apps/a${String(index + 1)}/pyproject.toml`,
        '[project]\nname = "a"\n',
      ]),
    );

    expect(failureAt(files)).toContain('apps/a10 (Python project), and 2 more.');
    expect(failureAt(files)).toContain('(the first ten; add the rest the same way).');
  });

  it('keeps the preset advice in a folder of its own', () => {
    expect(failureAt(SERVICES, 'services/orders')).toContain(
      'The current folder has pom.xml: create nitpicker.config.json with {"preset": "java"}',
    );
  });

  it('keeps the general advice when nothing looks like a project', () => {
    expect(failureAt({ 'notes.txt': 'x\n' })).toContain(
      'For a Java, Kotlin, Python or Go project, create nitpicker.config.json with its preset',
    );
  });
});
