import { afterEach, describe, expect, it } from 'vitest';
import {
  MAIN_PROPERTIES,
  openInView,
  type SpringFinding,
  project,
  removeProjects,
  readSpringConfigFindings,
} from './__tests__/spring-config-projects.mts';

afterEach(removeProjects);

const KOTLIN_ENTITY = 'package demo\n\nimport jakarta.persistence.Entity\n\n@Entity\nclass Repo\n';

function read(files: Readonly<Record<string, string>>): SpringFinding[] {
  return readSpringConfigFindings(project(files, { jpa: false }), {
    sourceRoots: ['src/main/kotlin'],
  });
}

describe('Spring configuration checks of a Kotlin project', () => {
  it('finds the persistence API in Kotlin sources, so open-in-view is checked', () => {
    expect(
      read({
        'src/main/kotlin/demo/Repo.kt': KOTLIN_ENTITY,
        [MAIN_PROPERTIES]: 'server.port=8080\n',
      }),
    ).toEqual([openInView(MAIN_PROPERTIES)]);
  });

  it('checks nothing about open-in-view for Kotlin sources that use no persistence API', () => {
    expect(
      read({
        'src/main/kotlin/demo/Plain.kt': 'package demo\n\nclass Plain\n',
        [MAIN_PROPERTIES]: 'server.port=8080\n',
      }),
    ).toEqual([]);
  });
});
