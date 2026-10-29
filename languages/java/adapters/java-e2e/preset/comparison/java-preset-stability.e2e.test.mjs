import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
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

const FACADE_FINDINGS = ['catalog', 'fines', 'loans', 'members'].map(
  (name) =>
    `library.features.${name} package-edge:library.features.${name}->library.features.${name}.adapters`,
);

describe.skipIf(!enabled)('stability direction over Java feature packages', () => {
  useMavenPresetProject();
  let projects;
  beforeAll(() => {
    projects = twinProjects().map(withLibrary);
  });
  it('passes a new feature that reuses three others through their top package on Gradle', () => {
    expect(stability(collectJavaFindings(projects[0], { gradle, policy: {} }))).toEqual([]);
  }, 180_000);
  it('passes the same feature on Maven', () => {
    expect(stability(collectJavaFindings(projects[1], { maven, policy: {} }))).toEqual([]);
  }, 180_000);
  it('reports each facade edge per package when the layout has no feature folders', () => {
    const policy = { layout: { featureRoots: [] } };

    expect(stability(collectJavaFindings(projects[1], { maven, policy }))).toEqual(FACADE_FINDINGS);
  }, 180_000);
});
