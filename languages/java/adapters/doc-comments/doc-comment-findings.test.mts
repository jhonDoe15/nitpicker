import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mts';
import { exceptionHint as untypedExceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { findingsOf } from '../typed/java-values.mts';
import { DOC_COMMENT_TOOL, readDocCommentFindings } from './doc-comment-findings.mts';

const exceptionHint: (rule: string, file: string) => string = untypedExceptionHint;
const RULE = 'doc-comment-content';
const { temporaryRoot } = useGitFixtures();

function project(files: Readonly<Record<string, string>>): string {
  const root = temporaryRoot('nitpicker-doc-comments-');
  writeFiles(root, files);
  return root;
}

const FILES = {
  'app/src/main/java/shop/Orders.java': [
    'package shop;',
    'class Orders {',
    '  /** Gets the order total. */',
    '  int getOrderTotal() { return 0; }',
    '  /** Cents, rounded down. */',
    '  int total() { return 0; }',
    '}',
  ].join('\n'),
  'app/src/main/java/shop/build/Steps.java':
    'package shop.build;\nclass Steps {\n  /** The steps. */\n  int steps;\n}\n',
  'app/src/main/kotlin/shop/Cart.kt': [
    'package shop',
    '/**',
    ' * One.',
    ' * Two.',
    ' * Three.',
    ' * Four.',
    ' * Five.',
    ' * Six.',
    ' */',
    'fun reconcile() = Unit',
  ].join('\n'),
  'app/src/test/java/shop/OrdersTest.java':
    'class OrdersTest {\n  /** Orders test. */\n  void ordersTest() {}\n}\n',
};
const MANIFEST = {
  sourceRoots: ['app/src/main/java', 'app/src/main/kotlin'],
  kotlinSourceRoots: ['app/src/main/kotlin'],
  testSourceRoots: ['app/src/test/java'],
};

function rows(findings: unknown) {
  return findingsOf(findings).map(({ tool, rule, path: file, identity, location }) => [
    tool,
    rule,
    file,
    identity,
    location?.line,
  ]);
}

describe('readDocCommentFindings', () => {
  it('reads the Java main sources in the java preset, package folders named build too', () => {
    const projectRoot = project(FILES);

    expect(
      rows(readDocCommentFindings({ projectRoot, manifest: MANIFEST, kotlin: false })),
    ).toEqual([
      [
        DOC_COMMENT_TOOL,
        RULE,
        'app/src/main/java/shop/build/Steps.java',
        'doc-comment:Steps.steps:restating',
        3,
      ],
      [
        DOC_COMMENT_TOOL,
        RULE,
        'app/src/main/java/shop/Orders.java',
        'doc-comment:Orders.getOrderTotal():restating',
        3,
      ],
    ]);
  });

  it('reads the Java and Kotlin main sources in the kotlin preset, each file once', () => {
    const projectRoot = project(FILES);

    expect(rows(readDocCommentFindings({ projectRoot, manifest: MANIFEST, kotlin: true }))).toEqual(
      [
        [
          DOC_COMMENT_TOOL,
          RULE,
          'app/src/main/java/shop/build/Steps.java',
          'doc-comment:Steps.steps:restating',
          3,
        ],
        [
          DOC_COMMENT_TOOL,
          RULE,
          'app/src/main/java/shop/Orders.java',
          'doc-comment:Orders.getOrderTotal():restating',
          3,
        ],
        [
          DOC_COMMENT_TOOL,
          RULE,
          'app/src/main/kotlin/shop/Cart.kt',
          'doc-comment:reconcile():long',
          2,
        ],
      ],
    );
  });

  it('says how to fix it and how to lift it', () => {
    const projectRoot = project(FILES);
    const finding = findingsOf(
      readDocCommentFindings({ projectRoot, manifest: MANIFEST, kotlin: false }),
    ).find(({ symbol }) => symbol === 'getOrderTotal');

    expect(finding?.message).toBe(
      `This doc comment only restates getOrderTotal. Delete it, or say what the name cannot: a unit, a limit, an edge case or why. ${exceptionHint(RULE, 'app/src/main/java/shop/Orders.java')}`,
    );
  });

  it('skips a source root outside the project and one that does not exist', () => {
    const projectRoot = project(FILES);
    const manifest = { sourceRoots: ['../elsewhere', 'missing/src'], kotlinSourceRoots: [] };

    expect(readDocCommentFindings({ projectRoot, manifest, kotlin: true })).toEqual([]);
  });
});
