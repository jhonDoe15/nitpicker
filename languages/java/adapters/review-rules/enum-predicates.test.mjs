import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ENUM_PREDICATE_RULE, withProjectEnumPredicates } from './enum-predicates.mjs';

const roots = [];
const MESSAGE = 'These comparisons list only some constants of an enum of the project.';

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'enum-predicates-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const STATUS = `package shop;

public enum Status {
  NEW("new") {
    @Override
    String label() { return "fresh, unpaid"; }
  },
  @Deprecated PAID("paid"),
  SHIPPED("shipped");

  private final String code;

  Status(String code) { this.code = code; }

  String label() { return code; }
}
`;

function finding(line, column) {
  return {
    tool: 'pmd',
    rule: ENUM_PREDICATE_RULE,
    path: 'src/main/java/shop/Orders.java',
    identity: `line ${String(line)}`,
    message: MESSAGE,
    classification: 'enforceable',
    location: { line, column },
  };
}

function orders(body, imports = '') {
  return `package shop;\n\nimport java.util.concurrent.TimeUnit;\n${imports}\nclass Orders {\n${body}\n}\n`;
}

function locate(text, start) {
  const lines = text.slice(0, text.indexOf(start)).split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function filtered(body, start, extra = {}, imports = '') {
  const text = orders(body, imports);
  const root = project({
    'src/main/java/shop/Status.java': STATUS,
    'src/main/java/shop/Orders.java': text,
    ...extra,
  });
  const { line, column } = locate(text, start);
  return withProjectEnumPredicates([finding(line, column)], root);
}

describe('withProjectEnumPredicates', () => {
  it('keeps a subset of a project enum and names the enum', () => {
    const kept = filtered(
      '  boolean open(Status s) { return s == Status.NEW || s == Status.PAID; }',
      's == Status.NEW',
    );

    expect(kept.map(({ message }) => message)).toEqual([
      'These comparisons list only some constants of Status.',
    ]);
  });

  it('keeps an EnumSet subset', () => {
    const body =
      '  boolean open(Status s) { return EnumSet.of(Status.NEW, Status.PAID).contains(s); }';

    expect(filtered(body, 'EnumSet.of')).toHaveLength(1);
  });

  it('drops a test that lists every constant', () => {
    const body =
      '  boolean any(Status s) { return s == Status.NEW || s == Status.PAID || s == Status.SHIPPED; }';

    expect(filtered(body, 's == Status.NEW')).toEqual([]);
  });

  it('drops a library enum and an enum of fewer than three constants', () => {
    const library = filtered(
      '  boolean coarse(TimeUnit u) { return u == TimeUnit.DAYS || u == TimeUnit.HOURS; }',
      'u == TimeUnit',
    );
    const small = filtered(
      '  boolean on(Switch s) { return s == Switch.ON || s == Switch.OFF; }',
      's == Switch',
      { 'src/main/java/shop/Switch.java': 'package shop;\nenum Switch { ON, OFF, }\n' },
    );

    expect([library, small]).toEqual([[], []]);
  });

  it('reads a nested enum and ignores enum names in comments and strings', () => {
    const holder = [
      'package shop;',
      'class Holder {',
      '  // enum Level { LOW, HIGH }',
      '  String text = "enum Level { LOW }";',
      '  enum Level { LOW, MID, HIGH }',
      '}',
    ].join('\n');
    const body =
      '  boolean low(Holder.Level l) { return l == Holder.Level.LOW || l == Holder.Level.MID; }';

    expect(
      filtered(body, 'l == Holder', { 'src/main/java/shop/Holder.java': holder }),
    ).toHaveLength(1);
  });

  it('reads constants imported one by one or with a static wildcard', () => {
    const body = '  boolean open(Status s) { return s == NEW || s == PAID; }';
    const every = '  boolean any(Status s) { return s == NEW || s == PAID || s == SHIPPED; }';
    const single = 'import static shop.Status.NEW;\nimport static shop.Status.PAID;\n';
    const wildcard = 'import static shop.Status.*;\n';

    expect(filtered(body, 's == NEW', {}, single).map(({ message }) => message)).toEqual([
      'These comparisons list only some constants of Status.',
    ]);
    expect(filtered(body, 's == NEW', {}, wildcard)).toHaveLength(1);
    expect(filtered(every, 's == NEW', {}, wildcard)).toEqual([]);
  });

  it('keeps a subset compared through an accessor and inside a larger condition', () => {
    const accessor =
      '  boolean open(Order o) { return o.status() == Status.NEW || o.status() == Status.PAID; }';
    const nested =
      '  boolean due(Status s, boolean paid) { return (s == Status.NEW || s == Status.PAID) && paid; }';

    expect(filtered(accessor, 'o.status() ==')).toHaveLength(1);
    expect(filtered(nested, 's == Status.NEW')).toHaveLength(1);
  });

  it('passes other findings through', () => {
    const other = { ...finding(1, 1), rule: 'EmptyCatchBlock' };

    expect(withProjectEnumPredicates([other], project({}))).toEqual([other]);
  });
});
