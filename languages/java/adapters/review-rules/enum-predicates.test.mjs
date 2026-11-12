import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../core/diff/git/test-support/git-checkout.mjs';
import { ENUM_PREDICATE_RULE, readEnums, withProjectEnumPredicates } from './enum-predicates.mjs';
import { byText } from '../../../../shared/text-order/by-text.mjs';

const { gitCheckout } = useGitCheckouts();

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

  it('keeps membership in Set.of, List.of and Arrays.asList and equals chains', () => {
    const forms = [
      ['  boolean a(Status s) { return Set.of(Status.NEW, Status.PAID).contains(s); }', 'Set.of'],
      ['  boolean a(Status s) { return List.of(Status.NEW, Status.PAID).contains(s); }', 'List.of'],
      [
        '  boolean a(Status s) { return Arrays.asList(Status.NEW, Status.PAID).contains(s); }',
        'Arrays',
      ],
      [
        '  boolean a(Status s) { return s.equals(Status.NEW) || Status.PAID.equals(s); }',
        's.equals',
      ],
      [
        '  boolean a(Status s) { return Objects.equals(s, Status.NEW) || s.equals(Status.PAID); }',
        'Objects',
      ],
    ];

    expect(forms.map(([body, start]) => filtered(body, start).length)).toEqual([1, 1, 1, 1, 1]);
  });

  it('reads equals on a statically imported constant', () => {
    const body = '  boolean a(Status s) { return NEW.equals(s) || PAID.equals(s); }';
    const every =
      '  boolean a(Status s) { return NEW.equals(s) || PAID.equals(s) || SHIPPED.equals(s); }';
    const wildcard = 'import static shop.Status.*;\n';

    expect(filtered(body, 'NEW.equals', {}, wildcard)).toHaveLength(1);
    expect(filtered(every, 'NEW.equals', {}, wildcard)).toEqual([]);
  });

  it('keeps a boolean switch with a default over some constants and names the enum', () => {
    const arrow =
      '  boolean a(Status s) { return switch (s) { case NEW, PAID -> true; default -> false; }; }';
    const statement =
      '  boolean a(Status s) { switch (s) { case NEW: return false; case PAID: return false; default: return true; } }';
    const qualified =
      '  boolean a(Status s) { return switch (s) { case Status.NEW, Status.PAID -> true; case null, default -> false; }; }';

    expect(filtered(arrow, 'switch').map(({ message }) => message)).toEqual([
      'These comparisons list only some constants of Status.',
    ]);
    expect(filtered(statement, 'switch')).toHaveLength(1);
    expect(filtered(qualified, 'switch')).toHaveLength(1);
  });

  it('drops a switch that lists every constant or one, over a library enum or over this', () => {
    const every =
      '  boolean a(Status s) { return switch (s) { case NEW, PAID, SHIPPED -> true; default -> false; }; }';
    const library =
      '  boolean a(TimeUnit u) { return switch (u) { case DAYS, HOURS -> true; default -> false; }; }';
    const period = {
      'src/main/java/shop/Period.java': 'package shop;\nenum Period { DAYS, HOURS, MINUTES }\n',
    };
    const single =
      '  boolean a(Status s) { return switch (s) { case NEW -> true; default -> false; }; }';
    const intoDefault =
      '  boolean a(Status s) { switch (s) { case NEW: return true; case PAID: default: return false; } }';
    const self =
      'boolean a() { return switch (this) { case NEW, PAID -> true; default -> false; }; }';

    expect(filtered(every, 'switch')).toEqual([]);
    expect(filtered(library, 'switch', period)).toEqual([]);
    expect(filtered(single, 'switch')).toEqual([]);
    expect(filtered(intoDefault, 'switch')).toEqual([]);
    expect(filtered(self, 'switch')).toEqual([]);
  });

  it('finds the enum of bare labels from the declared subject, or from every enum that has them', () => {
    const phase = {
      'src/main/java/shop/Phase.java': 'package shop;\nenum Phase { NEW, PAID, LATE }\n',
    };
    const declared =
      '  boolean a(Status s, Phase p) { return switch (s) { case NEW, PAID -> true; default -> false; }; }';
    const accessor =
      '  boolean a(Delivery d) { return switch (d.status()) { case NEW, PAID -> true; default -> false; }; }';
    const fullInOne =
      '  boolean a(Delivery d) { return switch (d.status()) { case NEW, PAID, SHIPPED -> true; default -> false; }; }';
    const intoDefault =
      '  boolean a(Status s) { switch (s) { case NEW: case PAID: return true; case SHIPPED: default: return false; } }';
    const messages = (body, extra) => filtered(body, 'switch', extra).map(({ message }) => message);

    expect(messages(declared, phase)).toEqual([
      'These comparisons list only some constants of Status.',
    ]);
    expect(messages(accessor)).toEqual(['These comparisons list only some constants of Status.']);
    expect(messages(accessor, phase)).toEqual([MESSAGE]);
    expect(
      messages(fullInOne, {
        'src/main/java/shop/Phase.java': 'package shop;\nenum Phase { NEW, PAID, SHIPPED, LATE }\n',
      }),
    ).toEqual([]);
    expect(messages(intoDefault)).toHaveLength(1);
  });

  it('drops membership that lists one constant of each of two enums', () => {
    const extra = {
      'src/main/java/shop/Phase.java': 'package shop;\nenum Phase { EARLY, LATE, DONE }\n',
    };
    const body = '  boolean a(Object s) { return Set.of(Status.NEW, Phase.LATE).contains(s); }';

    expect(filtered(body, 'Set.of', extra)).toEqual([]);
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

  it('keeps a finding of a Kotlin file, which the Kotlin reader has already resolved', () => {
    const kotlin = {
      ...finding(1, 1),
      path: 'src/main/kotlin/shop/Orders.kt',
      message: 'These comparisons list only some entries of Status.',
    };

    expect(withProjectEnumPredicates([kotlin], project({}))).toEqual([kotlin]);
  });
});

describe('readEnums', () => {
  it('reads the enums of a checkout, also in ignored generated folders, but not of nested checkouts', () => {
    const root = gitCheckout(
      {
        'src/main/java/shop/Status.java': STATUS,
        'src/main/generated/shop/Generated.java': 'enum Generated { A, B }\n',
        'build/Built.java': 'enum Built { A, B }\n',
        'node_modules/pkg/Vendored.java': 'enum Vendored { A, B }\n',
        ...nestedCheckout('agent', { 'src/main/java/shop/Other.java': 'enum Other { A, B }\n' }),
      },
      ['src/main/generated/', 'build/', 'node_modules/'],
    );

    expect([...readEnums(root).keys()].toSorted(byText)).toEqual(['Generated', 'Status']);
  });
});
