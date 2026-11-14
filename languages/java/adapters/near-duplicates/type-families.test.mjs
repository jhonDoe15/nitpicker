import { beforeAll, describe, expect, it } from 'vitest';
import { nearDuplicateFindings } from '../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { javaParser } from './test-support/parse-jvm.mjs';

let parse;

beforeAll(async () => {
  parse = await javaParser();
});

function arrayHelper(type, boxed) {
  return `  public static ${type}[] concat(${type}[]... arrays) {
    int length = 0;
    for (${type}[] array : arrays) {
      length += array.length;
    }
    ${type}[] result = new ${type}[length];
    int position = 0;
    for (${type}[] array : arrays) {
      System.arraycopy(array, 0, result, position, array.length);
      position += array.length;
    }
    ${boxed}.valueOf(result.length);
    return result;
  }
`;
}

function javaClass(name, body) {
  return `package demo;\n\npublic final class ${name} {\n${body}}\n`;
}

function reported(files) {
  const units = Object.entries(files).flatMap(([file, text]) => parse(text, file));
  return nearDuplicateFindings(units, { analyzerName: 'structure', isExcepted: () => false }).map(
    ({ symbol }) => symbol,
  );
}

describe('type-specialized copy families on the JVM', () => {
  it('skips overloads of one file that differ only in primitive and boxed types', () => {
    const body = arrayHelper('int', 'Integer') + arrayHelper('long', 'Long');

    expect(reported({ 'src/demo/Arrays.java': javaClass('Arrays', body) })).toEqual([]);
  });

  it('skips copies in sibling files named after their types, with their own helpers', () => {
    const files = {
      'src/demo/Ints.java': javaClass('Ints', arrayHelper('int', 'Integer')),
      'src/demo/Longs.java': javaClass('Longs', arrayHelper('long', 'Long')),
    };

    expect(reported(files)).toEqual([]);
  });

  it('reports the same copies in files not named after their types', () => {
    const files = {
      'src/demo/Orders.java': javaClass('Orders', arrayHelper('int', 'Integer')),
      'src/demo/Invoices.java': javaClass('Invoices', arrayHelper('long', 'Long')),
    };

    expect(reported(files)).toEqual(['Orders.concat(int[])']);
  });

  it('still reports a family member with a difference besides its types', () => {
    const drifted = arrayHelper('long', 'Long').replace(
      'position += array.length',
      'position += 1',
    );
    const body = arrayHelper('int', 'Integer') + drifted;

    expect(reported({ 'src/demo/Arrays.java': javaClass('Arrays', body) })).toEqual([
      'Arrays.concat(long[])',
    ]);
  });

  it('skips the generic member of a family and a run shared by family members', () => {
    const indexOf = (
      type,
    ) => `  public static int indexOf(${type}[] array, ${type} value, int start) {
    if (array == null || start < 0) {
      return -1;
    }
    for (int i = start; i < array.length; i++) {
      if (array[i] == value) {
        return i;
      }
    }
    return -1;
  }
`;
    const remove = (
      type,
      extra,
    ) => `  public static ${type}[] remove(${type}[] array, ${type} value, BitSet marks) {
${extra}    for (int i = 0; i < array.length; i++) {
      Counter count = counters.get(i);
      if (count != null) {
        if (count.decrementAndGet() == 0) {
          counters.remove(i);
        }
        marks.set(i);
      }
    }
    return array;
  }
`;
    const body = [
      indexOf('Object'),
      indexOf('long'),
      remove('T', '    audit(array.length);\n'),
      remove('int', '    check(value > 0, "positive");\n    trace(value);\n'),
    ].join('');

    expect(reported({ 'src/demo/Arrays.java': javaClass('Arrays', body) })).toEqual([]);
  });
});
