import path from 'node:path';
import { expect, it } from 'vitest';
import { EDITED_LINE_SENTENCE } from '../../../../../../core/diff/comparison/positions/touched-lines.mjs';

const sources = 'src/main/java/demo';

function javaClass(name, ...members) {
  return `package demo;\n\npublic final class ${name} {\n${members.join('\n\n')}\n}\n`;
}

const SPREAD = [
  '    int total = left + right;',
  '    total = total * 2;',
  '    total = total + left;',
  '    total = total - right;',
  '    total = total / 3;',
  '    return total;',
];

const PICK = [
  '  public int pick(int left, int right) {',
  '    if (left > right + 5) {',
  '      return left;',
  '    }',
];

function isThree(name, condition = 'if (value == 3) {') {
  return [
    `  public boolean ${name}(int value) {`,
    `    ${condition}`,
    '      return true;',
    '    }',
    '    return false;',
    '  }',
  ].join('\n');
}

function clamp(condition) {
  return [
    '  public int clamp(int value) {',
    `    ${condition}`,
    '      return 10;',
    '    }',
    '    return value;',
    '  }',
  ].join('\n');
}

export const TOUCHED_BASE = {
  [`${sources}/Picker.java`]: javaClass('Picker', [...PICK, ...SPREAD, '  }'].join('\n')),
  [`${sources}/Messy.java`]: javaClass('Messy', clamp('if(value>10){')),
  [`${sources}/Twice.java`]: javaClass('Twice', isThree('first'), isThree('second')),
  [`${sources}/Edited.java`]: javaClass('Edited', isThree('check')),
};

export const TOUCHED_HEAD = {
  [`${sources}/Picker.java`]: javaClass(
    'Picker',
    ['  private static int spread(int left, int right) {', ...SPREAD, '  }'].join('\n'),
    [...PICK, '    return spread(left, right);', '  }'].join('\n'),
  ),
  [`${sources}/Messy.java`]: javaClass('Messy', clamp('if (value > 10) {')),
  [`${sources}/Twice.java`]: javaClass(
    'Twice',
    isThree('first'),
    isThree('middle'),
    isThree('second'),
  ),
  [`${sources}/Edited.java`]: javaClass(
    'Edited',
    isThree('check', 'if (value == 3) { // three is the only special value'),
  ),
};

function locations(result, wanted) {
  return result.newFindings
    .filter(({ rule }) => rule === wanted)
    .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`);
}

export function touchedLineCases(resultOf) {
  it('keeps a legacy branch baselined above an extracted helper and through reformatting', () => {
    expect(
      locations(resultOf(), 'changed-branch-coverage').filter(
        (entry) => !entry.startsWith('Twice') && !entry.startsWith('Edited'),
      ),
    ).toEqual([]);
  });

  it('reports a repeated branch on the added method, not on a legacy one', () => {
    expect(
      locations(resultOf(), 'changed-branch-coverage').filter((entry) => entry.startsWith('Twice')),
    ).toEqual(['Twice.java:12']);
  });

  it('keeps literal conditions baselined through a move and a reformat, and finds the added one', () => {
    expect(locations(resultOf(), 'AvoidLiteralsInIfCondition')).toEqual(['Twice.java:12']);
  });

  it('says a legacy branch is new because the change edited its line', () => {
    const [edited, ...rest] = resultOf().newFindings.filter(
      ({ rule, path: file }) =>
        rule === 'changed-branch-coverage' && path.basename(file) === 'Edited.java',
    );

    expect(rest).toEqual([]);
    expect(edited.location.line).toBe(5);
    expect(edited.message).toContain(EDITED_LINE_SENTENCE);
  });
}
