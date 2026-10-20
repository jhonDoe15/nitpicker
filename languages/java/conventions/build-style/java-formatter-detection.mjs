import { childAt, parseXml } from '../../../../shared/ingest/common.mjs';
import { buildFiles } from './build-files.mjs';
import { withoutComments } from './build-comments.mjs';

const PALANTIR = /palantirjavaformat|palantir-java-format|com\.palantir\.java-format/u;
const GOOGLE = /googlejavaformat|google-java-format|com\.spotify\.fmt/u;
const CHAIN = String.raw`(?:\s*\.\s*\w+\s*\([^)]*\))*?`;
const GOOGLE_AOSP = new RegExp(
  String.raw`googlejavaformat\s*\([^)]*\)${CHAIN}\s*\.\s*(?:aosp\s*\(|style\s*\(\s*["']aosp["'])`,
  'u',
);
const PALANTIR_STYLE = new RegExp(
  String.raw`palantirjavaformat\s*\([^)]*\)${CHAIN}\s*\.\s*style\s*\(\s*["'](google|aosp)["']`,
  'u',
);
const JAVA_BLOCK = /\bjava\s*\{/gu;
const OTHER_FORMATTER = /\b(?:eclipse|prettier)\s*\(/u;
const PREFERENCE = ['palantir', 'google', 'none'];
const MAVEN_FORMATTER_ARTIFACTS = new Map([
  ['palantir-java-format', { formatter: 'palantir' }],
  ['google-java-format', { formatter: 'google' }],
]);

function braceBlock(text, open) {
  let depth = 0;
  for (const [offset, char] of [...text.slice(open)].entries()) {
    depth += { '{': 1, '}': -1 }[char] ?? 0;
    if (depth === 0) {
      return text.slice(open, open + offset + 1);
    }
  }
  return text.slice(open);
}

function declaresOtherFormatter(code) {
  return [...code.matchAll(JAVA_BLOCK)].some((match) =>
    OTHER_FORMATTER.test(braceBlock(code, match.index + match[0].length - 1)),
  );
}

function declaredInCode(text, kind) {
  const code = withoutComments(text, kind).toLowerCase();
  if (PALANTIR.test(code)) {
    const style = PALANTIR_STYLE.exec(code)?.[1];
    return style === undefined
      ? { formatter: 'palantir' }
      : { formatter: 'google', aosp: style === 'aosp' };
  }
  if (GOOGLE.test(code)) {
    return { formatter: 'google', aosp: GOOGLE_AOSP.test(code) };
  }
  return declaresOtherFormatter(code) ? { formatter: 'none' } : undefined;
}

function descendants(root, name) {
  const found = [root];
  for (const node of found) {
    found.push(...node.children);
  }
  return found.filter((node) => node.name === name);
}

function styleOf(node) {
  return childAt(node, 'style')?.text?.toLowerCase();
}

function spotlessStep(step) {
  const name = step.name.toLowerCase();
  const style = styleOf(step);
  if (name === 'googlejavaformat') {
    return { formatter: 'google', aosp: style === 'aosp' };
  }
  if (name === 'palantirjavaformat') {
    return style === 'google' || style === 'aosp'
      ? { formatter: 'google', aosp: style === 'aosp' }
      : { formatter: 'palantir' };
  }
  return name === 'eclipse' || name === 'prettier' ? { formatter: 'none' } : undefined;
}

function pluginDeclarations(plugin) {
  const artifact = childAt(plugin, 'artifactId')?.text;
  if (artifact === 'fmt-maven-plugin') {
    return [
      { formatter: 'google', aosp: styleOf(childAt(plugin, 'configuration') ?? plugin) === 'aosp' },
    ];
  }
  return artifact === 'spotless-maven-plugin'
    ? descendants(plugin, 'java').flatMap((java) => java.children.map(spotlessStep))
    : [];
}

function parsedPom(text) {
  try {
    return { root: parseXml(text) };
  } catch (error) {
    return { failure: error.message };
  }
}

function declaredInPom(text) {
  const { root, failure } = parsedPom(text);
  if (root === undefined) {
    return { failure };
  }
  const artifacts = descendants(root, 'artifactId').map((node) =>
    MAVEN_FORMATTER_ARTIFACTS.get(node.text),
  );
  return {
    declared: pickFormatter([
      ...descendants(root, 'plugin').flatMap(pluginDeclarations),
      ...artifacts,
    ]),
  };
}

function pickFormatter(declarations) {
  const found = declarations.filter((declaration) => declaration !== undefined);
  const formatter = PREFERENCE.find((name) => found.some((entry) => entry.formatter === name));
  return formatter === undefined
    ? undefined
    : {
        formatter,
        aosp: found.some((entry) => entry.formatter === formatter && entry.aosp === true),
      };
}

function declaredIn({ kind, text }) {
  return kind === 'xml' ? declaredInPom(text) : { declared: declaredInCode(text, kind) };
}

function pluralityDeclaration(declarations) {
  const counts = Object.groupBy(declarations, ({ formatter }) => formatter);
  const ranked = Object.entries(counts).sort(([, left], [, right]) => right.length - left.length);
  const [first, second] = ranked;
  if (first === undefined || second?.[1].length === first[1].length) {
    return undefined;
  }
  return { formatter: first[0], aosp: first[1].some(({ aosp }) => aosp === true) };
}

export function declaredJavaFormatter(source) {
  const { files, skipped } = buildFiles(source);
  const results = files.map((file) => ({ file: file.file, ...declaredIn(file) }));
  return {
    declared: pluralityDeclaration(results.flatMap(({ declared }) => declared ?? [])),
    notes: [
      ...results
        .filter(({ failure }) => failure !== undefined)
        .map(({ file, failure }) => `Could not read ${file}: ${failure}`),
      ...(skipped === 0
        ? []
        : [
            `Read the first ${String(files.length)} build files and skipped ${String(skipped)} more`,
          ]),
    ],
  };
}
