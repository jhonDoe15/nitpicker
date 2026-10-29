import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { readDocCommentFindings } from './doc-comment-findings.mjs';

const RULE = 'doc-comment-content';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-doc-comments-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
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

function rows(findings) {
  return findings.map(({ tool, rule, path: file, identity, location }) => [
    tool,
    rule,
    file,
    identity,
    location.line,
  ]);
}

describe('readDocCommentFindings', () => {
  it('reads the Java main sources in the java preset', () => {
    const projectRoot = project(FILES);

    expect(
      rows(readDocCommentFindings({ projectRoot, manifest: MANIFEST, kotlin: false })),
    ).toEqual([
      [
        'facts',
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
          'facts',
          RULE,
          'app/src/main/java/shop/Orders.java',
          'doc-comment:Orders.getOrderTotal():restating',
          3,
        ],
        ['facts', RULE, 'app/src/main/kotlin/shop/Cart.kt', 'doc-comment:reconcile():long', 2],
      ],
    );
  });

  it('says how to fix it and how to lift it', () => {
    const projectRoot = project(FILES);
    const [finding] = readDocCommentFindings({ projectRoot, manifest: MANIFEST, kotlin: false });

    expect(finding.message).toBe(
      `This doc comment only restates getOrderTotal. Delete it, or say what the name cannot: a unit, a limit, an edge case or why. ${exceptionHint(RULE, 'app/src/main/java/shop/Orders.java')}`,
    );
  });

  it('skips a source root outside the project and one that does not exist', () => {
    const projectRoot = project(FILES);
    const manifest = { sourceRoots: ['../elsewhere', 'missing/src'], kotlinSourceRoots: [] };

    expect(readDocCommentFindings({ projectRoot, manifest, kotlin: true })).toEqual([]);
  });
});
