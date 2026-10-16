import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lintedWarnings, relocated } from './lint-output.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function stagedTree(files) {
  const staged = mkdtempSync(path.join(tmpdir(), 'nitpicker-lint-output-'));
  roots.push(staged);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(staged, name)), { recursive: true });
    writeFileSync(path.join(staged, name), text);
  }
  return staged;
}

const ORDER = [
  'package demo;',
  'import lombok.Builder;',
  'import lombok.experimental.SuperBuilder;',
  '@Builder(toBuilder = true)',
  '@SuperBuilder @Deprecated class Order {',
  '  java.util.List items;',
  '}',
  '',
].join('\n');

const WILDCARD =
  'package demo;\nimport lombok.*;\nimport com.acme.Data;\n@Value\n@Data\nclass Item {}\n';

function block(staged, { file, line, source, caret, rule = 'unchecked' }) {
  return [
    `${path.join(staged, file)}:${String(line)}: warning: [${rule}] text`,
    source,
    caret,
    '  where T is a type-variable:',
  ];
}

describe('lintedWarnings', () => {
  it('drops warnings javac puts on a Lombok annotation and keeps the rest', () => {
    const staged = stagedTree({
      'app/src/main/java/demo/Order.java': ORDER,
      'app/src/main/java/demo/Item.java': WILDCARD,
    });
    const order = 'app/src/main/java/demo/Order.java';
    const item = 'app/src/main/java/demo/Item.java';
    const log = [
      ...block(staged, { file: order, line: 4, source: '@Builder(toBuilder = true)', caret: '^' }),
      ...block(staged, {
        file: order,
        line: 5,
        source: '@SuperBuilder @Deprecated class Order {',
        caret: '^',
      }),
      ...block(staged, {
        file: order,
        line: 5,
        source: '@SuperBuilder @Deprecated class Order {',
        caret: '              ^',
      }),
      ...block(staged, {
        file: order,
        line: 6,
        source: '  java.util.List items;',
        caret: '           ^',
        rule: 'rawtypes',
      }),
      ...block(staged, { file: item, line: 4, source: '@Value', caret: '^' }),
      ...block(staged, { file: item, line: 5, source: '@Data', caret: '^' }),
      '/elsewhere/build/generated/Made.java:3: warning: [rawtypes] found raw type: List',
      '  java.util.List names;',
      '6 warnings',
      '',
    ].join('\n');

    expect(lintedWarnings(log, { staged, from: 'app', to: 'app' }).split('\n')).toEqual([
      'app/src/main/java/demo/Order.java:5: warning: [unchecked] text',
      '@SuperBuilder @Deprecated class Order {',
      '              ^',
      '  where T is a type-variable:',
      'app/src/main/java/demo/Order.java:6: warning: [rawtypes] text',
      '  java.util.List items;',
      '           ^',
      '  where T is a type-variable:',
      'app/src/main/java/demo/Item.java:5: warning: [unchecked] text',
      '@Data',
      '^',
      '  where T is a type-variable:',
      '6 warnings',
      '',
    ]);
  });

  it('treats a fully qualified lombok annotation as Lombok without an import', () => {
    const staged = stagedTree({ 'src/A.java': 'package demo;\n@lombok.Builder\nclass A {}\n' });
    const log = block(staged, {
      file: 'src/A.java',
      line: 2,
      source: '@lombok.Builder',
      caret: '^',
    });

    expect(lintedWarnings(`${log.join('\n')}\n1 warning\n`, { staged, from: '', to: '' })).toBe(
      '1 warning\n',
    );
  });
});

describe('relocated', () => {
  it('writes the module paths relative to the report root', () => {
    const staged = path.join(tmpdir(), 'staged');
    const log = `${path.join(staged, 'app', 'src/A.java')}:3: error: boom\n`;

    expect(relocated(log, { staged, from: 'app', to: '' })).toBe('src/A.java:3: error: boom\n');
    expect(relocated(log, { staged, from: 'app', to: 'app' })).toBe(
      'app/src/A.java:3: error: boom\n',
    );
  });
});
