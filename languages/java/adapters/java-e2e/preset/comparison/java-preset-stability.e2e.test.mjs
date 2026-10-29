import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { libraryProject } from '../../../../../../shared/rules/stability/test-support/library-project.mjs';
import { collectJavaFindings } from '../../../java-diff.mjs';
import {
  enabled,
  gradle,
  maven,
  twinProjects,
  useMavenPresetProject,
} from '../../../../maven/__tests__/maven-preset-project.mjs';
import { librarySources } from '../../test-support/library-sources.mjs';

function withLibrary(root) {
  for (const [file, text] of Object.entries(
    librarySources(libraryProject({ withFines: true }).uses),
  )) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function stability(findings) {
  return findings
    .filter(({ rule }) => rule === 'stability-direction')
    .map(({ path: file, identity }) => `${file} ${identity}`)
    .sort();
}

describe.skipIf(!enabled)('stability direction over Java feature packages', () => {
  useMavenPresetProject();
  it('passes a new feature that reuses three others through their top package on Gradle and Maven', () => {
    const [gradleProject, mavenProject] = twinProjects().map(withLibrary);

    expect(stability(collectJavaFindings(gradleProject, { gradle, policy: {} }))).toEqual([]);
    expect(stability(collectJavaFindings(mavenProject, { maven, policy: {} }))).toEqual([]);
    expect(
      stability(
        collectJavaFindings(mavenProject, { maven, policy: { layout: { featureRoots: [] } } }),
      ),
    ).toEqual(
      ['catalog', 'fines', 'loans', 'members'].map(
        (name) =>
          `library.features.${name} package-edge:library.features.${name}->library.features.${name}.adapters`,
      ),
    );
  }, 600_000);
});
