const LINE_BREAK = /\r\n|\r|\n/;
const IMPORT = /^[ \t]*import\b[^\n\r]*/gm;
const NAME = /^[\w.*]+/;
const PACKAGE = /^[ \t]*package\s[^\n\r]*$/m;
const SCHEDULING = 'org.springframework.scheduling.annotation';
const FEATURES = new Map([
  ['enable-scheduling', { annotation: 'EnableScheduling', owner: SCHEDULING }],
  ['enable-async', { annotation: 'EnableAsync', owner: SCHEDULING }],
  [
    'enable-caching',
    { annotation: 'EnableCaching', owner: 'org.springframework.cache.annotation' },
  ],
  [
    'enable-methodsecurity',
    {
      annotation: 'EnableMethodSecurity',
      owner: 'org.springframework.security.config.annotation.method.configuration',
    },
  ],
  ['enable-retry', { annotation: 'EnableRetry', owner: 'org.springframework.retry.annotation' }],
]);

export function featureOf(key) {
  return FEATURES.get(key);
}

function importLines(text) {
  return [...text.matchAll(IMPORT)].map((match) => {
    const words = match[0].trim().split(/\s+/);
    const isStatic = words[1] === 'static';
    return {
      start: match.index,
      end: match.index + match[0].length,
      isStatic,
      name: NAME.exec(words[isStatic ? 2 : 1] ?? '')?.[0] ?? '',
    };
  });
}

function lineEnd(text, offset) {
  const match = LINE_BREAK.exec(text.slice(offset));
  return match === null ? text.length : offset + match.index + match[0].length;
}

function isImported(imports, owner, annotation) {
  return imports.some(
    ({ name, isStatic }) =>
      !isStatic && (name === `${owner}.${annotation}` || name === `${owner}.*`),
  );
}

function importInsertion(source, name) {
  const { text, imports, lineBreak, semicolon } = source;
  const line = `import ${name}${semicolon}`;
  const plain = imports.filter(({ isStatic }) => !isStatic);
  const before = plain.find((item) => item.name > name);
  if (before !== undefined) {
    return { offset: before.start, text: `${line}${lineBreak}` };
  }
  const last = plain.at(-1) ?? imports.at(-1);
  if (last !== undefined) {
    const end = lineEnd(text, last.end);
    const separator = plain.length === 0 ? lineBreak : '';
    return end === last.end
      ? { offset: end, text: `${lineBreak}${separator}${line}` }
      : { offset: end, text: `${separator}${line}${lineBreak}` };
  }
  const header = PACKAGE.exec(text);
  return header === null
    ? { offset: 0, text: `${line}${lineBreak}${lineBreak}` }
    : {
        offset: lineEnd(text, header.index + header[0].length),
        text: `${lineBreak}${line}${lineBreak}`,
      };
}

function annotationLine(text, offset) {
  const start =
    Math.max(text.lastIndexOf('\n', offset - 1), text.lastIndexOf('\r', offset - 1)) + 1;
  return { start, indent: /^[ \t]*/.exec(text.slice(start))[0] };
}

function byImportName(left, right) {
  return `${left.owner}.${left.annotation}`.localeCompare(`${right.owner}.${right.annotation}`);
}

export function enableInsertions({ text, annotationAt, features, semicolon }) {
  const lineBreak = LINE_BREAK.exec(text)?.[0] ?? '\n';
  const imports = importLines(text);
  const source = { text, imports, lineBreak, semicolon };
  const where = annotationLine(text, annotationAt);
  const inserted = [...features]
    .sort(byImportName)
    .filter(({ annotation, owner }) => !isImported(imports, owner, annotation))
    .map(({ annotation, owner }) => importInsertion(source, `${owner}.${annotation}`));
  const lines = features.map(
    ({ annotation, args = '' }) => `${where.indent}@${annotation}${args}${lineBreak}`,
  );
  const merged = new Map();
  for (const { offset, text: added } of [
    ...inserted,
    { offset: where.start, text: lines.join('') },
  ]) {
    merged.set(offset, `${merged.get(offset) ?? ''}${added}`);
  }
  return [...merged].map(([offset, added]) => ({ offset, text: added }));
}
