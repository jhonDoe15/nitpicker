const INI_SECTION = /^\[([^\]]+)\]\s*$/;
const INI_OPTION_START = /^[^\s=:]/;
const INI_COMMENT = /\s+[#;].*$/;

function startSection(name, sections, state) {
  state.options = new Map();
  state.key = undefined;
  sections.set(name.trim(), state.options);
}

function appendValue(content, state) {
  state.options.set(state.key, `${state.options.get(state.key)}\n${content}`);
}

function startOption(line, state) {
  const split = line.search(/[=:]/);
  if (!INI_OPTION_START.test(line) || split === -1 || state.options === undefined) {
    return;
  }
  state.key = line.slice(0, split).trim();
  state.options.set(state.key, line.slice(split + 1).trim());
}

function isIndented(line) {
  return /^\s/.test(line);
}

function sectionName(line) {
  return isIndented(line) ? undefined : INI_SECTION.exec(line.trim())?.[1];
}

function readIniLine(line, sections, state) {
  const content = line.trim();
  const name = sectionName(line);
  if (content === '' || /^[#;]/.test(content)) {
    state.key = undefined;
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

export function parseIni(text) {
  const sections = new Map();
  const state = { options: undefined, key: undefined };
  for (const raw of text.split(/\r?\n/)) {
    readIniLine(raw.replace(INI_COMMENT, ''), sections, state);
  }
  return sections;
}
