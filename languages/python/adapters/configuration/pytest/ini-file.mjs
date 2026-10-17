function isComment(line) {
  return line.startsWith('#') || line.startsWith(';');
}

function sectionName(line) {
  return line.startsWith('[') && line.endsWith(']') ? line.slice(1, -1).trim() : undefined;
}

function splitOption(line) {
  const equals = line.indexOf('=');
  const colon = line.indexOf(':');
  const cut = [equals, colon].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return cut === undefined
    ? { key: line, value: '' }
    : { key: line.slice(0, cut).trim(), value: line.slice(cut + 1).trim() };
}

function isIndented(raw) {
  return raw.startsWith(' ') || raw.startsWith('\t');
}

export function parseIni(text) {
  const sections = new Map();
  let options;
  let current;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    const name = sectionName(line);
    if (line === '' || isComment(line)) {
      continue;
    }
    if (isIndented(raw) && options !== undefined && current !== undefined) {
      options.set(current, `${options.get(current) ?? ''}\n${line}`.trim());
    } else if (name !== undefined) {
      options = new Map();
      sections.set(name, options);
      current = undefined;
    } else if (options !== undefined) {
      const option = splitOption(line);
      options.set(option.key, option.value);
      current = option.key;
    }
  }
  return sections;
}
