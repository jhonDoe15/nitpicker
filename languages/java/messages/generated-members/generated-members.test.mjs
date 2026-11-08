import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERIC_CYCLE,
  GENERIC_EXCLUDE,
  GENERIC_MEMBERS,
  GENERIC_SUPERCLASS,
  MEMBER_CYCLE_RULE,
  SKIPPED_SUPER_RULE,
  withGeneratedMembers,
} from './generated-members.mjs';

const roots = [];
const MAIN = 'src/main/java/shop';
const CYCLE_MESSAGE = `${GENERIC_MEMBERS} can follow this field around ${GENERIC_CYCLE}. Mark the back reference ${GENERIC_EXCLUDE}.`;
const SUPER_MESSAGE = `This class extends ${GENERIC_SUPERCLASS}, which declares fields.`;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'generated-members-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function javaFile(name, body, imports = 'import java.util.List;\nimport lombok.*;\n') {
  return [`${MAIN}/${name}.java`, `package shop;\n\n${imports}\n${body}\n`];
}

function locate(text, index) {
  const before = text.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function candidates(files, rule, pattern) {
  return Object.entries(files).flatMap(([file, text]) =>
    [...text.matchAll(pattern)].map((match) => ({
      tool: 'pmd',
      rule,
      path: file,
      message: rule === MEMBER_CYCLE_RULE ? CYCLE_MESSAGE : SUPER_MESSAGE,
      classification: 'enforceable',
      location: locate(text, match.index),
    })),
  );
}

const FIELD = /(?<=\s)\w+(?=;)/gu;
const EXTENDS = /extends \w+/gu;

function reported(entries, rule = MEMBER_CYCLE_RULE) {
  const files = Object.fromEntries(entries);
  const pattern = rule === MEMBER_CYCLE_RULE ? FIELD : EXTENDS;
  return withGeneratedMembers(candidates(files, rule, pattern), { projectRoot: project(files) });
}

function summary(findings) {
  return findings.map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`);
}

const ORDER = javaFile('Order', '@Data\npublic class Order {\n  private List<Item> items;\n}');
const ITEM = javaFile('Item', '@Data\npublic class Item {\n  private String sku;\n  private Order order;\n}');

describe('generated members over a cycle of Lombok fields', () => {
  it('reports the back reference of a parent and child pair once, naming the cycle', () => {
    const findings = reported([ORDER, ITEM]);

    expect(summary(findings)).toEqual(['Item.java:9']);
    expect(findings[0].message).toBe(
      'The generated toString, equals and hashCode can follow this field around the cycle Order.items -> Item.order -> Order. Mark the back reference @ToString.Exclude and @EqualsAndHashCode.Exclude.',
    );
  });

  it('reports a node that holds its parent and its children, on the parent', () => {
    const node = javaFile(
      'Node',
      '@Data\npublic class Node {\n  private Node parent;\n  private List<Node> children;\n}',
    );

    expect(summary(reported([node]))).toEqual(['Node.java:8']);
  });

  it.each([
    ['a tree that only holds its children', '  private List<Node> children;'],
    ['a list that only holds the next node', '  private Node next;'],
    ['two single references', '  private Node left;\n  private Node right;'],
  ])('allows %s', (_name, fields) => {
    expect(reported([javaFile('Node', `@Data\npublic class Node {\n${fields}\n}`)])).toEqual([]);
  });

  it('names only the member that still recurses, with its exclusion', () => {
    const item = javaFile(
      'Item',
      '@Data\npublic class Item {\n  @ToString.Exclude\n  private Order order;\n}',
    );
    const [finding] = reported([ORDER, item]);

    expect(finding.message).toBe(
      'The generated equals and hashCode can follow this field around the cycle Order.items -> Item.order -> Order. Mark the back reference @EqualsAndHashCode.Exclude.',
    );
  });

  it.each([
    ['both exclusions', '@Data\npublic class Item {\n  @ToString.Exclude @EqualsAndHashCode.Exclude private Order order;\n}'],
    [
      'exclude lists',
      '@Data\n@ToString(exclude = "order")\n@EqualsAndHashCode(exclude = {"order"})\npublic class Item {\n  private Order order;\n}',
    ],
    [
      'of lists',
      '@Data\n@ToString(of = "sku")\n@EqualsAndHashCode(of = {"sku"})\npublic class Item {\n  private String sku;\n  private Order order;\n}',
    ],
    [
      'only explicitly included fields',
      '@ToString(onlyExplicitlyIncluded = true)\n@EqualsAndHashCode(onlyExplicitlyIncluded = true)\npublic class Item {\n  @ToString.Include @EqualsAndHashCode.Include private String sku;\n  private Order order;\n}',
    ],
    [
      'hand-written members',
      '@Getter\npublic class Item {\n  private Order order;\n  @Override public String toString() { return "item"; }\n  @Override public boolean equals(Object other) { return this == other; }\n  @Override public int hashCode() { return 1; }\n}',
    ],
    ['a class without generated members', 'public class Item {\n  private Order order;\n}'],
    ['a static field', '@Data\npublic class Item {\n  private static Order order;\n}'],
  ])('allows a back reference left out by %s', (_name, body) => {
    expect(reported([ORDER, javaFile('Item', body)])).toEqual([]);
  });

  it('keeps a transient back reference in toString only', () => {
    const item = javaFile('Item', '@Data\npublic class Item {\n  private transient Order order;\n}');
    const [finding] = reported([ORDER, item]);

    expect(finding.message).toContain('The generated toString can follow');
  });

  it('follows a cycle through three classes and reports it on one field', () => {
    const files = [
      javaFile('Graph', '@Value\npublic class Graph {\n  List<Edge> edges;\n}'),
      javaFile('Edge', '@Value\npublic class Edge {\n  Vertex target;\n}'),
      javaFile('Vertex', '@Value\npublic class Vertex {\n  Graph graph;\n}'),
    ];

    expect(summary(reported(files))).toEqual(['Vertex.java:8']);
  });

  it('follows nested classes and wildcard imports of another package', () => {
    const order = [
      'src/main/java/shop/orders/Order.java',
      'package shop.orders;\n\nimport java.util.Map;\nimport lombok.Data;\nimport shop.items.*;\n\n@Data\npublic class Order {\n  private Map<String, Item.Line> lines;\n}\n',
    ];
    const item = [
      'src/main/java/shop/items/Item.java',
      'package shop.items;\n\nimport lombok.Data;\nimport shop.orders.Order;\n\npublic class Item {\n  @Data\n  public static class Line {\n    private Order order;\n  }\n}\n',
    ];

    expect(summary(reported([order, item]))).toEqual(['Item.java:9']);
  });

  it('does not join a class of the same name in a package that is not imported', () => {
    const other = [
      'src/main/java/other/Order.java',
      'package other;\n\nimport lombok.Data;\n\n@Data\npublic class Order {\n  private shop.Item item;\n}\n',
    ];
    const item = javaFile('Item', '@Data\npublic class Item {\n  private other.Order order;\n}');

    expect(summary(reported([other, item]))).toEqual(['Item.java:8']);
    expect(reported([other, javaFile('Item', '@Data\npublic class Item {\n  private Order order;\n}')])).toEqual([]);
  });

  it('honours lombok.config and ignores annotations that are not Lombok', () => {
    const config = ['lombok.config', 'lombok.toString.onlyExplicitlyIncluded = true\n'];
    const item = javaFile('Item', '@Data\npublic class Item {\n  @EqualsAndHashCode.Exclude private Order order;\n}');
    const notLombok = javaFile('Item', '@Data\npublic class Item {\n  private Order order;\n}', 'import java.util.List;\nimport other.Data;\n');

    expect(reported([config, ORDER, item])).toEqual([]);
    expect(reported([ORDER, notLombok])).toEqual([]);
  });

  it('leaves other rules and test sources alone', () => {
    const files = Object.fromEntries([ORDER, ITEM]);
    const other = { tool: 'pmd', rule: 'Other', path: ORDER[0], message: 'm', location: { line: 1 } };

    expect(withGeneratedMembers([other], { projectRoot: project(files) })).toEqual([other]);
    const testFiles = Object.fromEntries(
      [ORDER, ITEM].map(([file, text]) => [file.replace('src/main', 'src/test'), text]),
    );
    expect(reported(Object.entries(testFiles))).toEqual([]);
  });
});

describe('generated equals that skips the superclass', () => {
  const base = javaFile('Base', 'public class Base {\n  protected String tenant;\n}', '');

  it('reports @Data on a subclass of a project class with fields, naming that class', () => {
    const child = javaFile('Child', '@Data\npublic class Child extends Base {\n  private String name;\n}');
    const findings = reported([base, child], SKIPPED_SUPER_RULE);

    expect(summary(findings)).toEqual(['Child.java:7']);
    expect(findings[0].message).toBe('This class extends Base, which declares fields.');
  });

  it('names the ancestor that declares the fields', () => {
    const middle = javaFile('Middle', 'public abstract class Middle extends Base {\n}', '');
    const child = javaFile('Child', '@EqualsAndHashCode\npublic class Child extends Middle {\n}');

    expect(reported([base, middle, child], SKIPPED_SUPER_RULE)[0].message).toContain('extends Base,');
  });

  it.each([
    ['an explicit callSuper', '@Data\n@EqualsAndHashCode(callSuper = false)\npublic class Child extends Base {\n}'],
    ['a superclass outside the project', '@Data\npublic class Child extends java.util.Date {\n}'],
    ['hand-written equals', '@Data\npublic class Child extends Base {\n  public boolean equals(Object o) { return false; }\n}'],
    ['no generated equals', '@ToString\npublic class Child extends Base {\n}'],
  ])('allows %s', (_name, body) => {
    expect(reported([base, javaFile('Child', body)], SKIPPED_SUPER_RULE)).toEqual([]);
  });

  it('allows a superclass without instance fields and a callSuper set in lombok.config', () => {
    const empty = javaFile('Base', 'public class Base {\n  static int count;\n}', '');
    const child = javaFile('Child', '@Data\npublic class Child extends Base {\n}');
    const config = ['src/lombok.config', 'lombok.equalsAndHashCode.callSuper = call\n'];

    expect(reported([empty, child], SKIPPED_SUPER_RULE)).toEqual([]);
    expect(reported([base, child, config], SKIPPED_SUPER_RULE)).toEqual([]);
  });
});
