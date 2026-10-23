import { JSCPD_MODES, JSCPD_PROJECT_FILE, JSCPD_SIZE } from './config.mjs';

const UNITS = { b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
const NITPICKER_MINIMUMS = { minTokens: 50, minLines: 5 };

function bytes(size) {
  const [, amount, unit = 'b'] = JSCPD_SIZE.exec(size);
  return Number(amount) * UNITS[unit[0].toLowerCase()];
}

function raisedMinimum(key) {
  return (base = NITPICKER_MINIMUMS[key], head = NITPICKER_MINIMUMS[key]) => head > base;
}

function lowerLimit(measure) {
  return (base, head) =>
    head !== undefined && (base === undefined || measure(head) < measure(base));
}

function addedEntries(base = [], head = []) {
  return head.some((entry) => !base.includes(entry));
}

const LOOSENS = {
  minTokens: raisedMinimum('minTokens'),
  minLines: raisedMinimum('minLines'),
  maxLines: lowerLimit(Number),
  maxSize: lowerLimit(bytes),
  mode: (base = 'mild', head = 'mild') => JSCPD_MODES.indexOf(head) < JSCPD_MODES.indexOf(base),
  ignoreCase: (base, head) => base === true && head !== true,
  ignore: addedEntries,
  ignorePattern: addedEntries,
};

function shown(value) {
  return value === undefined ? 'not set' : JSON.stringify(value);
}

export function jscpdConfigChanges({ base, head }) {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys
    .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(head[key]))
    .map((key) => {
      const text = `jscpd ${JSCPD_PROJECT_FILE} ${key}: ${shown(base[key])} -> ${shown(head[key])}`;
      return LOOSENS[key](base[key], head[key])
        ? { loosened: { text, files: [JSCPD_PROJECT_FILE] } }
        : { changed: text };
    });
}
