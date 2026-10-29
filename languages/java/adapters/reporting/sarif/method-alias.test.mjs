import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { withoutGeneratedSources } from '../../generated/generated-sources.mjs';
import { sarifFindings } from './sarif-reports.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const RULE = 'ForwardingMethodAlias';
const MESSAGE =
  'This method only passes its parameters, in order, to another method of the same class. Call that method directly and delete the alias.';
const HAND_WRITTEN = 'src/main/java/shop/Cart.java';
const MAPSTRUCT = 'src/main/java/shop/CartMapperImpl.java';
const BUILD_OUTPUT = 'build/generated/sources/annotationProcessor/java/main/shop/CartImpl.java';

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-method-alias-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function pmdResult(root, file, line) {
  return {
    ruleId: RULE,
    message: { text: MESSAGE },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: `file://${root}/${file}` },
          region: { startLine: line },
        },
      },
    ],
  };
}

function findingsAt(root, placements) {
  const reportRoot = path.join(root, 'reports');
  mkdirSync(reportRoot, { recursive: true });
  const pmd = {
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'PMD', rules: [] } },
        results: placements.map(([file, line]) => pmdResult(root, file, line)),
      },
    ],
  };
  writeFileSync(path.join(reportRoot, 'pmd.sarif'), JSON.stringify(pmd));
  writeFileSync(path.join(reportRoot, 'spotbugs.sarif'), '');
  return sarifFindings({
    projectRoot: root,
    reportRoot,
    roots: [root],
    sourceRoots: ['src/main/java'],
    allSourceRoots: ['src/main/java'],
    manifest: {},
  });
}

const SOURCES = {
  [HAND_WRITTEN]: 'package shop;\n\npublic class Cart {}\n',
  [MAPSTRUCT]:
    'package shop;\n\n@Generated(value = "org.mapstruct.ap.MappingProcessor")\npublic class CartMapperImpl {}\n',
  [BUILD_OUTPUT]: 'package shop;\n\npublic class CartImpl {}\n',
};

describe('ForwardingMethodAlias findings', () => {
  it('keeps the identity when the alias moves and reports a second alias as new', () => {
    const root = project(SOURCES);
    const base = findingsAt(root, [[HAND_WRITTEN, 10]]);
    const moved = findingsAt(root, [[HAND_WRITTEN, 42]]);
    const added = findingsAt(root, [
      [HAND_WRITTEN, 10],
      [HAND_WRITTEN, 20],
    ]);

    expect(base.map(({ rule, tool }) => [tool, rule])).toEqual([['pmd', RULE]]);
    expect(moved.map(({ identity }) => identity)).toEqual(base.map(({ identity }) => identity));
    expect(compareFindings({ baseFindings: base, headFindings: moved })).toMatchObject({
      newFindings: [],
      resolvedFindings: [],
    });
    expect(compareFindings({ baseFindings: base, headFindings: added }).newFindings).toHaveLength(
      1,
    );
  });

  it('is dropped in generated sources, as every Java finding is', () => {
    const root = project(SOURCES);
    const found = findingsAt(root, [
      [HAND_WRITTEN, 10],
      [MAPSTRUCT, 6],
      [BUILD_OUTPUT, 3],
    ]);

    expect(found).toHaveLength(3);
    expect(withoutGeneratedSources(found, root).map(({ path: file }) => file)).toEqual([
      HAND_WRITTEN,
    ]);
  });
});
