import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { callUntyped, findingsOf, type JavaFinding } from '../../typed/java-values.mts';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { withoutGeneratedSources } from '../../generated/generated-sources.mts';
import { sarifFindings } from './sarif-reports.mts';

type Placement = readonly [string, number, string?];

const { temporaryRoot } = useGitFixtures();

const RULE = 'ForwardingMethodAlias';
const RENAME_RULE = 'ForwardingMethodAliasRename';
const MESSAGE =
  'This method only passes its parameters, in order, to another method of the same class. Call that method directly and delete the alias.';
const RENAME_MESSAGE =
  "This method only passes its parameters, in order, to a less visible method of the same class. Rename that method to this method's name and delete the alias.";
const HAND_WRITTEN = 'src/main/java/shop/Cart.java';
const MAPSTRUCT = 'src/main/java/shop/CartMapperImpl.java';
const BUILD_OUTPUT = 'build/generated/sources/annotationProcessor/java/main/shop/CartImpl.java';

function project(files: Readonly<Record<string, string>>): string {
  const root = temporaryRoot('nitpicker-method-alias-');
  writeFiles(root, files);
  return root;
}

function pmdResult(root: string, [file, line, variant = 'direct']: Placement): object {
  const renamed = variant === 'rename';
  return {
    ruleId: renamed ? RENAME_RULE : RULE,
    message: { text: renamed ? RENAME_MESSAGE : MESSAGE },
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

function findingsAt(root: string, placements: readonly Placement[]): JavaFinding[] {
  const reportRoot = path.join(root, 'reports');
  mkdirSync(reportRoot, { recursive: true });
  const pmd = {
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'PMD', rules: [] } },
        results: placements.map((placement) => pmdResult(root, placement)),
      },
    ],
  };
  writeFileSync(path.join(reportRoot, 'pmd.sarif'), JSON.stringify(pmd));
  writeFileSync(path.join(reportRoot, 'spotbugs.sarif'), '');
  return findingsOf(
    callUntyped(sarifFindings, {
      projectRoot: root,
      reportRoot,
      roots: [root],
      sourceRoots: ['src/main/java'],
      allSourceRoots: ['src/main/java'],
      manifest: {},
    }),
  );
}

function compared(
  baseFindings: readonly JavaFinding[],
  headFindings: readonly JavaFinding[],
): unknown {
  return callUntyped(compareFindings, { baseFindings, headFindings });
}

const CART = [
  'package shop;',
  '',
  'public class Cart {',
  '  public long total(long cents) {',
  '    return this.sum(cents);',
  '  }',
  '',
  '  public long size(long cents) {',
  '    return this.count(cents);',
  '  }',
  '',
  '  long sum(long cents) {',
  '    return cents;',
  '  }',
  '',
  '  public long count(long cents) {',
  '    return cents;',
  '  }',
  '}',
  '',
].join('\n');
function lineOf(name: string): number {
  return CART.split('\n').findIndex((line) => line.includes(`long ${name}(`)) + 1;
}
const MOVED_CART = `// one\n// two\n${CART}`;

const SOURCES = {
  [HAND_WRITTEN]: CART,
  [MAPSTRUCT]:
    'package shop;\n\n@Generated(value = "org.mapstruct.ap.MappingProcessor")\npublic class CartMapperImpl {}\n',
  [BUILD_OUTPUT]: 'package shop;\n\npublic class CartImpl {}\n',
};

describe('ForwardingMethodAlias findings', () => {
  it('keeps the identity when the alias moves and reports a second alias as new', () => {
    const root = project(SOURCES);
    const base = findingsAt(root, [[HAND_WRITTEN, lineOf('total'), 'rename']]);
    writeFileSync(path.join(root, HAND_WRITTEN), MOVED_CART);
    const moved = findingsAt(root, [[HAND_WRITTEN, lineOf('total') + 2, 'rename']]);
    const added = findingsAt(root, [
      [HAND_WRITTEN, lineOf('total') + 2, 'rename'],
      [HAND_WRITTEN, lineOf('size') + 2, 'rename'],
    ]);

    expect(base.map(({ rule, tool }) => [tool, rule])).toEqual([['pmd', RULE]]);
    expect(moved.map(({ identity }) => identity)).toEqual(base.map(({ identity }) => identity));
    const unchanged = compared(base, moved);

    expect([fieldOf(unchanged, 'newFindings'), fieldOf(unchanged, 'resolvedFindings')]).toEqual([
      [],
      [],
    ]);
    expect(fieldOf(compared(base, added), 'newFindings')).toHaveLength(1);
  });

  it('reports a less visible target under the same rule with the rename message', () => {
    const root = project(SOURCES);
    const found = findingsAt(root, [
      [HAND_WRITTEN, lineOf('total'), 'rename'],
      [HAND_WRITTEN, lineOf('size')],
    ]);

    expect(found.map(({ rule, message }) => [rule, message])).toEqual([
      [RULE, RENAME_MESSAGE],
      [RULE, MESSAGE],
    ]);
  });

  it('is dropped in generated sources, as every Java finding is', () => {
    const root = project(SOURCES);
    const found = findingsAt(root, [
      [HAND_WRITTEN, lineOf('total')],
      [MAPSTRUCT, 6],
      [BUILD_OUTPUT, 3],
    ]);

    expect(found).toHaveLength(3);
    expect(
      findingsOf(callUntyped(withoutGeneratedSources, found, root)).map(({ path: file }) => file),
    ).toEqual([HAND_WRITTEN]);
  });
});
