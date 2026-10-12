import { readEntry } from './entry.js';

// Reads the settings files of the importer. One "key = value" per line; a line that starts
// with "#" is a comment. A value is a comma separated list. "key+ = value" appends to the
// list the key already has.
export type Settings = {
  readonly [key: string]: readonly string[];
};

export function parseSettings(text: string): Settings {
  const result: any = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.charAt(0) === '#') {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) {
      throw new Error('Line ' + (i + 1) + ': expected key=value');
    }
    let key = line.substring(0, eq).trim();
    let append = false;
    if (key.charAt(key.length - 1) === '+') {
      append = true;
      key = key.substring(0, key.length - 1).trim();
    }
    const entry = readEntry(key, line.substring(eq + 1));
    if (entry.kind === 'invalid') {
      throw new Error(`Line ${String(i + 1)}: ${entry.reason}`);
    }
    const values = entry.values;
    if (append && result[key] !== undefined) {
      for (let j = 0; j < values.length; j++) {
        result[key].push(values[j]);
      }
    } else {
      result[key] = values;
    }
  }
  return result;
}
