import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mts';
import { BASE, appliedFiles, filesOf } from '../test-support/cross-sources.mjs';
import { compileFilesStatus, javacAvailable } from '../test-support/javac.mjs';

function plan(files, root = '/nonexistent') {
  const { fixes, notes } = recipe.plan({ files, projectRoot: root });
  return { fixes, notes: notes.map((note) => note.split('near-duplicate: ').at(-1)), files };
}

const INTERFACES = 'the copies need two different interfaces of the same name';

function copyOf(name, type, builder) {
  return `
    public ${type} ${name}(${builder} part) {
        ${builder} out = new ${builder}();
        for (int index = 0; index < part.length(); index++) {
            out.append(part.charAt(index)).append(',');
        }
        out.append("KIND");
        if (out.length() > 100) {
            out.setLength(100);
        }
        return new ${type}(out);
    }
`;
}

function twoCopies(type) {
  return {
    extra:
      copyOf('copyA', type, 'StringBuilder') + copyOf('copyB', type, 'java.lang.StringBuilder'),
  };
}

const WHEN = '    private final TYPE when = null;\n';

function used(type, imports) {
  const base = { extra: WHEN.replace('TYPE', type), call: 'when.hashCode();' };
  return { ...base, imports };
}

describe('javaExtractNearDuplicateRecipe resolves the names of two files', () => {
  it.each([['Helper'], ['helper']])('declines a static import of %s that differs', (member) => {
    const imports = (owner) => `import static demo.${owner}.${member};\n`;
    const { fixes, notes } = plan(
      filesOf(used(member, imports('First')), used(member, imports('Second'))),
    );
    expect([fixes.length, notes]).toEqual([
      0,
      ['the files import different static members the shared code may use'],
    ]);
  });

  it('does not take a field access for a qualified type', () => {
    const extra = '    int viaConfig(Config cfg) { return cfg.Date; }\n';
    const { fixes, files } = plan(filesOf({ extra }, {}));
    const after = appliedFiles(files, fixes);
    const first = after['src/main/java/demo/SqlDateAdapter.java'];
    expect([fixes.length, first.includes('import cfg.'), first.includes('cfg.Date')]).toEqual([
      1,
      false,
      true,
    ]);
  });

  it.runIf(javacAvailable())('compiles a field access that looks like a qualified type', () => {
    const extra = '    int viaConfig(Config cfg) { return cfg.Date; }\n';
    const { fixes, files } = plan(filesOf({ extra }, {}));
    const config = 'package demo;\n\nclass Config {\n    int Date;\n}\n';
    const after = appliedFiles(files, fixes);
    const result = compileFilesStatus({ 'Adapter.java': BASE, 'Config.java': config, ...after });
    expect([result.status, result.stderr.replace(/Picked up.*\n/u, '')]).toEqual([0, '']);
  });

  it('declines two creators that would share a name and differ in their types', () => {
    const { fixes, notes } = plan(filesOf(twoCopies('java.sql.Date'), twoCopies('Time')));
    expect([fixes.length, notes.length > 0, notes.every((note) => note === INTERFACES)]).toEqual([
      0,
      true,
      true,
    ]);
  });
});
