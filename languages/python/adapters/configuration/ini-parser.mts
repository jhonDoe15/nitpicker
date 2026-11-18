export type IniSections = Map<string, IniOptions>;

export type IniOptions = Map<string, string>;

type IniState = { options: IniOptions | undefined; key: string | undefined };

const INI_SECTION = /^\[([^\]]+)\]\s*$/;
const INI_OPTION_START = /^[^\s=:]/;
const INI_COMMENT = /\s+[#;].*$/;

function startSection(name: string, sections: IniSections, state: IniState): void {
  state.options = new Map();
  state.key = undefined;
  sections.set(name.trim(), state.options);
}

function appendValue(content: string, state: IniState): void {
  if (state.options === undefined || state.key === undefined) {
    return;
  }
  state.options.set(state.key, `${state.options.get(state.key) ?? ''}\n${content}`);
}

function startOption(line: string, state: IniState): void {
  const split = line.search(/[=:]/);
  if (!INI_OPTION_START.test(line) || split === -1 || state.options === undefined) {
    return;
  }
  state.key = line.slice(0, split).trim();
  state.options.set(state.key, line.slice(split + 1).trim());
}

function isIndented(line: string): boolean {
  return /^\s/.test(line);
}

function sectionName(line: string): string | undefined {
  return isIndented(line) ? undefined : INI_SECTION.exec(line.trim())?.[1];
}

function readIniLine(line: string, sections: IniSections, state: IniState): void {
  const content = line.trim();
  const name = sectionName(line);
  if (content === '' || /^[#;]/.test(content)) {
    return;
  }
  if (name !== undefined) {
    startSection(name, sections, state);
    return;
  }
  if (isIndented(line) && state.key !== undefined) {
    appendValue(content, state);
    return;
  }
  startOption(line, state);
}

export function parseIni(text: string): IniSections {
  const sections: IniSections = new Map();
  const state: IniState = { options: undefined, key: undefined };
  for (const raw of text.split(/\r\n?|\n/u)) {
    readIniLine(raw.replace(INI_COMMENT, ''), sections, state);
  }
  return sections;
}
