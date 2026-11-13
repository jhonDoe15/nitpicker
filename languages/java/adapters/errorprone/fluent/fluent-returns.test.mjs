import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readErrorProneFindings } from '../java-errorprone.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const LABEL = `package demo;
public class Label {
  private final java.util.List<String> names = new java.util.ArrayList<>();
  public Label addName(String name) {
    this.names.add(name);
    return this;
  }
  public Label rename(String name) {
    if (name.isEmpty()) {
      return this;
    }
    names.add(name);
    return (this);
  }
  public int size() {
    return names.size();
  }
  public Label copy(String name) {
    return new Label().addName(name);
  }
  public Label pick(boolean mine) {
    if (mine) {
      return this;
    }
    return new Label();
  }
  public Label build(String name) {
    return new Label() {
      Label self() {
        return this;
      }
    };
  }
}
`;
const CALLER = `package demo;
class Caller {
  void run(Label label) {
    label.addName("a");
    label.rename("b");
    label.size();
    label.copy("c");
    label.pick(true);
    label.build("d");
  }
}
`;

function module(root, name, sources) {
  const reportRoot = path.join(root, name, 'build/nitpicker');
  const work = path.join(reportRoot, 'errorprone');
  mkdirSync(work, { recursive: true });
  const files = Object.entries(sources).map(([file, text]) => {
    const target = path.join(root, name, 'src/main/java/demo', file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
    return target;
  });
  writeFileSync(path.join(work, 'main.args'), ['-d', 'x', '--sources', ...files, ''].join('\n'));
  return { reportRoot, caller: path.join(root, name, 'src/main/java/demo/Caller.java') };
}

function reportedIn(modules, calls) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-fluent-')));
  roots.push(root);
  const built = Object.entries(modules).map(([name, sources]) => module(root, name, sources));
  const [{ reportRoot, caller }] = built;
  const diagnostics = calls.map((call, index) => ({
    file: caller,
    line: 4 + index,
    column: 5,
    kind: 'WARNING',
    message: `[CheckReturnValue] The result of \`${call}\` must be used\n  (see bugpattern)`,
  }));
  writeFileSync(path.join(reportRoot, 'errorprone.json'), JSON.stringify(diagnostics));
  return readErrorProneFindings({
    reportRoot,
    roots: [root],
    lintedRoots: ['app/src/main/java', 'web/src/main/java'],
    modules: built.map((one) => ({ reportRoot: one.reportRoot })),
  }).map((finding) => finding.message.split('`')[1]);
}

function reported(sources, calls) {
  return reportedIn({ app: sources }, calls);
}

const FILES = { 'Label.java': LABEL, 'Caller.java': CALLER };

describe('CheckReturnValue on fluent methods', () => {
  it('passes a call as a statement when every return of the method is this', () => {
    expect(reported(FILES, ['addName(...)', 'rename(...)'])).toEqual([]);
  });

  it('still reports a method that returns a computed value, or this on only some paths', () => {
    const calls = ['size()', 'copy(...)', 'pick(...)', 'build(...)'];

    expect(reported(FILES, calls)).toEqual(calls);
  });

  it('keeps a method whose name is also declared with another result, or declared nowhere', () => {
    const other =
      'package demo;\nclass Other {\n  String addName(String name) {\n    return name;\n  }\n}\n';
    const calls = ['addName(...)', 'unknown(...)'];

    expect(reported({ ...FILES, 'Other.java': other }, calls)).toEqual(calls);
  });

  it('matches the number of parameters, and counts a record component as a zero-argument method', () => {
    const builder =
      'package demo;\nclass Builder {\n  Builder name(String n) {\n    return this;\n  }\n}\n';
    const person =
      'package demo;\nrecord Person(String name, java.util.Map<String, Integer> ages) {}\n';

    expect(reported({ ...FILES, 'Builder.java': builder }, ['name(...)'])).toEqual([]);
    expect(
      reported({ ...FILES, 'Builder.java': builder, 'Person.java': person }, ['name()']),
    ).toEqual(['name()']);
    expect(
      reported({ ...FILES, 'Builder.java': builder, 'Person.java': person }, ['name(...)']),
    ).toEqual([]);
  });

  it('judges a name over every module of the project', () => {
    const money =
      'package demo;\nclass Money {\n  Money add(Money other) {\n    return new Money();\n  }\n}\n';
    const form =
      'package demo;\nclass Form {\n  Form add(String value) {\n    return this;\n  }\n}\n';

    expect(
      reportedIn(
        { web: { 'Form.java': form, 'Caller.java': CALLER }, core: { 'Money.java': money } },
        ['add(...)'],
      ),
    ).toEqual(['add(...)']);
    expect(reportedIn({ web: { 'Form.java': form, 'Caller.java': CALLER } }, ['add(...)'])).toEqual(
      [],
    );
  });

  it('accepts a self-typed builder returning a cast this or a self() that only returns this', () => {
    const base = `package demo;
abstract class Base<T extends Base<T>> {
  T tag(String tag) {
    return (T) this;
  }
  T mark(String mark) {
    return self();
  }
  T pass(String mark) {
    return other();
  }
  abstract T other();
  T self() {
    return (T) this;
  }
}
`;

    expect(
      reported({ ...FILES, 'Base.java': base }, ['tag(...)', 'mark(...)', 'pass(...)']),
    ).toEqual(['pass(...)']);
  });
});
