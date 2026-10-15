import { describe, expect, it } from 'vitest';
import { javaLineLengthFindings, maskTextBlocks } from './line-length.mjs';

const WIDE = 'x'.repeat(95);
const file = (text, path = 'src/main/java/demo/A.java') => ({ path, kind: 'source', text });
const found = (text, options = {}) =>
  javaLineLengthFindings([file(text)], { analyzerName: 'structure', ...options });

describe('maskTextBlocks', () => {
  it('empties the lines inside a text block and keeps the lines around it', () => {
    const text = ['String a = """', '  wide text', '  """;', 'int b;'].join('\n');
    expect(maskTextBlocks(text)).toBe(['String a = """', '', '', 'int b;'].join('\n'));
  });
});

describe('Java line length', () => {
  it('fails a code line over 100 characters with the allowed form and the exception route', () => {
    const [finding] = found(`int a;\nint ${WIDE} = ${WIDE};\n`);
    expect(finding.location).toEqual({ line: 2 });
    expect(finding.message).toBe(
      'Line is 198 characters (limit 100). Break it up or extract a named value. If this is intended, add {"rule":"line-length-limit","paths":["src/main/java/demo/A.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('does not count string literal text, text blocks, imports or URLs', () => {
    const text = [
      `String s = "${'y'.repeat(120)}";`,
      'String t = """',
      'z'.repeat(130),
      '""";',
      `import ${'a.'.repeat(60)}B;`,
      '// see https://example.com/' + 'p'.repeat(100),
    ].join('\n');
    expect(found(text)).toEqual([]);
  });

  it('is lifted for the paths an exception names', () => {
    const text = `int ${WIDE} = ${WIDE};\n`;
    expect(
      found(text, { exceptions: [{ rule: 'line-length-limit', paths: ['src/main/**'] }] }),
    ).toEqual([]);
  });
});
