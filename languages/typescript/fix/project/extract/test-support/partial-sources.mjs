const LOOP = `  const headers: Record<string, string> = {};
  for (const line of raw) {
    const index = line.indexOf(':');
    if (index > 0 && Object.keys(headers).length < limit) {
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
  }
  const names = Object.keys(headers).sort();`;

export function headerCopy(
  name,
  { before = '', after = '  return names.join(",");', loop = LOOP } = {},
) {
  const lead = before === '' ? '' : `${before}\n`;
  return `export function ${name}(raw: string[], limit: number) {\n${lead}${loop}\n${after}\n}\n`;
}

export function headerPair(options = {}) {
  return [
    headerCopy('headerNames', options),
    headerCopy('headerCount', {
      ...options,
      before: '  const total = raw.length;',
      after: '  return names.length + total;',
    }),
  ].join('\n');
}

function validationChecks(message) {
  return `  if (name.length === 0) {
    throw new Error('${message}');
  }
  if (age < 0 || Number.isNaN(age)) {
    throw new Error('age must not be negative');
  }
  if (name.length > 64) {
    throw new Error('name is too long');
  }
  const trimmed = name.trim().toLowerCase();`;
}

export function validationCopy(name, { message, after, binds = true }) {
  const checks = binds
    ? validationChecks(message)
    : validationChecks(message).replace(/\n.*trimmed.*$/u, '');
  return `export function ${name}(name: string, age: number) {\n${checks}\n${after}\n}\n`;
}

export function validationPair() {
  return [
    validationCopy('createUser', {
      message: 'name is required',
      after: '  return { name: trimmed, age };',
    }),
    validationCopy('renameUser', {
      message: 'new name is required',
      after: "  const label = trimmed + ':' + String(age);\n  return label.toUpperCase();",
    }),
  ].join('\n');
}

export function returningPair() {
  const loop = `${LOOP}\n  return names.join(',');`;
  return [
    headerCopy('headerLine', {
      before: '  const total = raw.length;\n  void total;',
      loop,
      after: '',
    }),
    headerCopy('headerTrace', {
      before: "  if (limit < 0) {\n    return '';\n  }",
      loop,
      after: '',
    }),
  ]
    .join('\n')
    .replaceAll('\n\n}', '\n}');
}
