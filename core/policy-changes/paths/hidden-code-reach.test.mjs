import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { policyChangeFields } from '../describe-policy-changes.mjs';
import { readPolicyScope } from '../policy-scope.mjs';

const { createGitRepository } = useGitFixtures();
const HEADING = 'exclude and layout.excludedGlobs hide code this change adds or moves';

function loosenings({ base, head, config }) {
  const scope = readPolicyScope({
    baseConfig: config,
    headConfig: config,
    baseProjectRoot: createGitRepository(base).root,
    headProjectRoot: createGitRepository(head).root,
  });
  return policyChangeFields(config, config, scope).policyLoosenings;
}

describe('Python', () => {
  const config = { preset: 'python', exclude: ['legacy/**'] };
  const base = {
    'src/app/__init__.py': '',
    'src/app/core.py': 'x = 1\n',
    'legacy/__init__.py': '',
    'legacy/old.py': 'y = 1\n',
  };

  it('fails hidden code that a production module imports, directly or through a hidden module', () => {
    const head = {
      ...base,
      'src/app/core.py': 'from legacy import feature\n',
      'legacy/feature.py': 'from . import deeper\n',
      'legacy/deeper.py': 'z = 1\n',
      'legacy/unused.py': 'w = 1\n',
    };

    expect(loosenings({ base, head, config })).toEqual([
      `${HEADING} that production code imports: legacy/deeper.py (imported by src/app/core.py), legacy/feature.py (imported by src/app/core.py)`,
    ]);
  });

  it('passes hidden code that only hidden or test modules import', () => {
    const head = {
      ...base,
      'legacy/feature.py': 'x = 1\n',
      'legacy/other.py': 'import legacy.feature\n',
      'tests/test_core.py': 'import legacy.other\n',
    };

    expect(loosenings({ base, head, config })).toEqual([]);
  });
});

describe('Java and Kotlin', () => {
  const config = { preset: 'java', exclude: ['src/main/java/legacy/**'] };
  const base = {
    'build.gradle': "plugins { id 'java' }\n",
    'src/main/java/a/Service.java': 'package a;\nclass Service {}\n',
    'src/main/java/legacy/Old.java': 'package legacy;\nclass Old {}\n',
  };

  it('fails hidden code that production imports by name, by wildcard or by qualified use', () => {
    const head = {
      ...base,
      'src/main/java/a/Service.java':
        'package a;\nimport legacy.Feature;\nimport legacy.tools.*;\nclass Service {\n  Object x = new Feature();\n  Object y = Tool.make();\n  Object z = legacy.Direct.value();\n}\n',
      'src/main/java/legacy/Feature.java': 'package legacy;\npublic class Feature {}\n',
      'src/main/java/legacy/tools/Tool.java': 'package legacy.tools;\npublic class Tool {}\n',
      'src/main/java/legacy/Direct.java': 'package legacy;\npublic class Direct {}\n',
      'src/main/java/legacy/Unused.java': 'package legacy;\nclass Unused {}\n',
    };

    expect(loosenings({ base, head, config })).toEqual([
      `${HEADING} that production code imports: src/main/java/legacy/Direct.java (imported by src/main/java/a/Service.java), src/main/java/legacy/Feature.java (imported by src/main/java/a/Service.java), src/main/java/legacy/tools/Tool.java (imported by src/main/java/a/Service.java)`,
    ]);
  });

  it('follows same-package use and Kotlin declarations, and ignores names in comments and strings', () => {
    const kotlin = { preset: 'kotlin', exclude: ['src/main/kotlin/gen/**'] };
    const kotlinBase = {
      'build.gradle.kts': 'plugins { kotlin("jvm") }\n',
      'src/main/kotlin/app/Main.kt': 'package app\nfun main() {}\n',
      'src/main/kotlin/gen/Old.kt': 'package gen\nclass Old\n',
    };
    const head = {
      ...kotlinBase,
      'src/main/kotlin/app/Main.kt':
        'package app\nimport gen.render\n// Mention\nval text = "Ghost"\nfun main() { render() }\n',
      'src/main/kotlin/gen/Render.kt': 'package gen\nfun render() {}\n',
      'src/main/kotlin/gen/Mention.kt': 'package gen\nclass Mention\n',
      'src/main/kotlin/gen/Ghost.kt': 'package gen\nclass Ghost\n',
    };

    expect(loosenings({ base: kotlinBase, head, config: kotlin })).toEqual([
      'exclude and layout.excludedGlobs hide code this change adds or moves that production code imports: src/main/kotlin/gen/Render.kt (imported by src/main/kotlin/app/Main.kt)',
    ]);
  });
});
