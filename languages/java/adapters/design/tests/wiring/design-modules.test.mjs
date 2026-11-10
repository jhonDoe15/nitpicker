import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DESIGN_FACTS_FAILURE_RULE, designFindings } from '../../design-findings.mjs';
import { gradleDesignModules, mavenDesignModules } from '../../design-modules.mjs';

const REPORTS = 'target/nitpicker';
const work = [];

function reactor(manifests) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-modules-'));
  work.push(root);
  for (const [folder, manifest] of Object.entries(manifests)) {
    mkdirSync(path.join(root, folder, REPORTS), { recursive: true });
    writeFileSync(path.join(root, folder, REPORTS, 'manifest.json'), JSON.stringify(manifest));
  }
  return root;
}

afterEach(() => {
  for (const root of work.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('the modules the design rules read', () => {
  it('prefixes the source roots of each Maven module with its folder and keeps published', () => {
    const root = reactor({
      core: { sourceRoots: ['src/main/java'], published: true },
      app: { sourceRoots: ['src/main/java', 'target/generated-sources/x'] },
    });

    expect(
      mavenDesignModules(root, [path.join(root, 'core'), path.join(root, 'app')], REPORTS),
    ).toEqual([
      { dir: 'core', sourceRoots: ['core/src/main/java'], published: true },
      {
        dir: 'app',
        sourceRoots: ['app/src/main/java', 'app/target/generated-sources/x'],
        published: false,
      },
    ]);
  });

  it('keeps the roots of a Maven project without modules as they are', () => {
    const root = reactor({ '.': { sourceRoots: ['src/main/java'] } });

    expect(mavenDesignModules(root, [root], REPORTS)).toEqual([
      { dir: '', sourceRoots: ['src/main/java'], published: false },
    ]);
  });

  it('names the Maven module that has no manifest', () => {
    const root = reactor({ core: { sourceRoots: ['src/main/java'] } });
    const modules = [path.join(root, 'core'), path.join(root, 'app')];

    expect(() => mavenDesignModules(root, modules, REPORTS)).toThrow(
      new Error('The design rules found no manifest.json for the Maven module app'),
    );
  });

  it('turns a missing manifest into the design facts tool error', () => {
    const root = reactor({});

    expect(
      designFindings({
        projectRoot: root,
        listModules: () => mavenDesignModules(root, [path.join(root, 'core')], REPORTS),
        policy: {},
      }),
    ).toEqual([
      {
        tool: 'java',
        rule: DESIGN_FACTS_FAILURE_RULE,
        path: '.',
        identity: DESIGN_FACTS_FAILURE_RULE,
        message:
          'The design rules could not read the Java sources: The design rules found no manifest.json for the Maven module core',
        classification: 'tool-error',
      },
    ]);
  });

  it('reads the Gradle modules from the manifests of the report', () => {
    const report = {
      modules: [
        { dir: 'lib', manifest: { sourceRoots: ['lib/src/main/java'], published: true } },
        { dir: '', manifest: {} },
      ],
    };

    expect(gradleDesignModules(report)).toEqual([
      { dir: 'lib', sourceRoots: ['lib/src/main/java'], published: true },
      { dir: '', sourceRoots: [], published: false },
    ]);
  });
});
