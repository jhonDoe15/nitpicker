import { JSCPD_PROJECT_FILE } from '../../../../shared/conventions/tool-precedence.mjs';
import { changedKeys } from '../../../../shared/values/changed-keys.mts';
import { listOf } from '../../../../shared/values/readers.mts';
import { JSCPD_MODES, JSCPD_SIZE, shownSetting } from './config-views.mts';
import type { AppliedValues, FileChange, Loosens, Setting } from './config-views.mts';

const UNITS: Readonly<Record<string, number>> = { b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
const NITPICKER_MINIMUMS = { minTokens: 50, minLines: 5 };

function bytes(size: Setting): number {
  const [, amount = '', unit = 'b'] = JSCPD_SIZE.exec(String(size)) ?? [];
  return Number(amount) * (UNITS[unit.slice(0, 1).toLowerCase()] ?? 1);
}

function raisedMinimum(key: 'minTokens' | 'minLines'): Loosens {
  return (base = NITPICKER_MINIMUMS[key], head = NITPICKER_MINIMUMS[key]) =>
    Number(head) > Number(base);
}

function lowerLimit(measure: (value: Setting) => number): Loosens {
  return (base, head) =>
    head !== undefined && (base === undefined || measure(head) < measure(base));
}

function addedEntries(base: Setting = [], head: Setting = []): boolean {
  return listOf(head).some((entry) => !listOf(base).includes(entry));
}

const LOOSENS: Readonly<Record<string, Loosens>> = {
  minTokens: raisedMinimum('minTokens'),
  minLines: raisedMinimum('minLines'),
  maxLines: lowerLimit(Number),
  maxSize: lowerLimit(bytes),
  mode: (base = 'mild', head = 'mild') => JSCPD_MODES.indexOf(head) < JSCPD_MODES.indexOf(base),
  ignoreCase: (base, head) => base === true && head !== true,
  ignore: addedEntries,
  ignorePattern: addedEntries,
};

export function jscpdConfigChanges({ base, head }: AppliedValues): FileChange[] {
  return changedKeys(base, head).map((key) => {
    const text = `jscpd ${JSCPD_PROJECT_FILE} ${key}: ${shownSetting(base[key])} -> ${shownSetting(head[key])}`;
    return LOOSENS[key]?.(base[key], head[key])
      ? { loosened: { text, kind: 'tool-config', files: [JSCPD_PROJECT_FILE] } }
      : { changed: text };
  });
}
