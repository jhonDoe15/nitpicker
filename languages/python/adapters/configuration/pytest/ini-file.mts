import type { IniFile, IniFileState } from '../typed/config-types.mts';

function isComment(line: string): boolean {
  return line.startsWith('#') || line.startsWith(';');
}

function sectionName(line: string): string | undefined {
  return line.startsWith('[') && line.endsWith(']') ? line.slice(1, -1).trim() : undefined;
}

function splitOption(line: string): { key: string; value: string } {
  const equals = line.indexOf('=');
  const colon = line.indexOf(':');
  const cut = [equals, colon].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return cut === undefined
    ? { key: line, value: '' }
    : { key: line.slice(0, cut).trim(), value: line.slice(cut + 1).trim() };
}

function isIndented(raw: string): boolean {
  return raw.startsWith(' ') || raw.startsWith('\t');
}

function addLine(sections: IniFile, state: IniFileState, raw: string): void {
  const line = raw.trim();
  if (line === '' || isComment(line)) {
    return;
  }
  const name = sectionName(line);
  if (isIndented(raw) && state.options !== undefined && state.current !== undefined) {
    state.options.set(state.current, `${state.options.get(state.current) ?? ''}\n${line}`.trim());
  } else if (name !== undefined) {
    state.options = new Map<string, string>();
    sections.set(name, state.options);
    state.current = undefined;
  } else if (state.options !== undefined) {
    const option = splitOption(line);
    state.options.set(option.key, option.value);
    state.current = option.key;
  }
}

export function parseIni(text: string): IniFile {
  const sections: IniFile = new Map();
  const state: IniFileState = { options: undefined, current: undefined };
  for (const raw of text.split(/\r?\n/u)) {
    addLine(sections, state, raw);
  }
  return sections;
}
