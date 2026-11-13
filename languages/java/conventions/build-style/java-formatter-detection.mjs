import { buildFiles } from './build-files.mjs';
import { withoutComments } from './build-comments.mjs';
import { disagree, mergedDetails, stepFormatterDetails } from './java-formatter-options.mjs';
import {
  formatterSteps,
  outsideSpotless,
  spotlessJavaBlocks,
} from './declarations/formatter-steps.mjs';
import { flagValue, unquoted, versionValue } from './declarations/formatter-values.mjs';
import {
  declaredInPom,
  parsedPom,
  pomProperties,
} from './declarations/maven-formatter-declarations.mjs';
import { gradleValue } from './declarations/value-references.mjs';

const PALANTIR_STYLE = 'palantir';
const GOOGLE_STYLE = 'google';
const PALANTIR = /palantirjavaformat|palantir-java-format|com\.palantir\.java-format/u;
const GOOGLE = /googlejavaformat|google-java-format|com\.spotify\.fmt/u;
const OTHER_FORMATTER = /\b(?:eclipse|prettier)\s*\(/iu;
const PREFERENCE = [PALANTIR_STYLE, GOOGLE_STYLE, 'none'];

function legacyDeclaration(code) {
  const lower = code.toLowerCase();
  if (PALANTIR.test(lower)) {
    return { formatter: PALANTIR_STYLE };
  }
  return GOOGLE.test(lower)
    ? { formatter: GOOGLE_STYLE, aosp: GOOGLE_AOSP.test(lower) }
    : undefined;
}

const GOOGLE_AOSP =
  /googlejavaformat\s*\([^)]*\)[^;]*?\.\s*(?:aosp\s*\(|style\s*\(\s*["']aosp["'])/u;

function chainFlag(step, name, reading) {
  const call = step.chain.find(({ name: callName }) => callName === name.toLowerCase());
  return call === undefined ? undefined : flagValue(call.argument, name, reading);
}

function stepDeclaration(step, reading) {
  const style = step.chain.find(({ name }) => name === 'style');
  const aosp =
    step.chain.some(({ name }) => name === 'aosp') || unquoted(style?.argument ?? '') === 'aosp';
  if (
    step.name === 'palantirjavaformat' &&
    [GOOGLE_STYLE, 'aosp'].includes(unquoted(style?.argument ?? ''))
  ) {
    return { formatter: GOOGLE_STYLE, aosp };
  }
  const formatter = step.name === 'palantirjavaformat' ? PALANTIR_STYLE : GOOGLE_STYLE;
  return {
    formatter,
    aosp: formatter === GOOGLE_STYLE && aosp,
    ...stepFormatterDetails(formatter, {
      version: versionValue(step.version, reading),
      formatJavadoc: chainFlag(step, 'formatJavadoc', reading),
      reflowLongStrings: chainFlag(step, 'reflowLongStrings', reading),
    }),
  };
}

function declaredInCode({ file, text, kind }, context) {
  const code = withoutComments(text, kind);
  const blocks = spotlessJavaBlocks(code);
  const reading = {
    file,
    notes: [],
    resolve: (argument) =>
      gradleValue(argument, {
        text: code,
        properties: context.gradleProperties,
        catalog: context.catalog,
      }),
  };
  const steps = (blocks ?? []).flatMap(formatterSteps);
  if (steps.length > 0) {
    return { entries: steps.map((step) => stepDeclaration(step, reading)), notes: reading.notes };
  }
  const entry =
    blocks?.some((block) => OTHER_FORMATTER.test(block)) === true
      ? { formatter: 'none' }
      : legacyDeclaration(blocks === undefined ? code : outsideSpotless(code));
  return { entries: entry === undefined ? [] : [entry], notes: [] };
}

function pickFormatter(entries) {
  const formatter = PREFERENCE.find((name) => entries.some((entry) => entry.formatter === name));
  return formatter === undefined
    ? undefined
    : entries.filter((entry) => entry.formatter === formatter);
}

function fileDeclaration(file, entries, notes) {
  const group = pickFormatter(entries);
  if (group === undefined) {
    return undefined;
  }
  const clash = disagree(group);
  if (clash !== undefined) {
    notes.push(
      `${file} declares ${group[0].formatter}-java-format more than once with different versions or options; using the first`,
    );
  }
  return {
    file,
    formatter: group[0].formatter,
    aosp: group.some(({ aosp }) => aosp === true),
    ...mergedDetails(group),
  };
}

function declaredIn(file, context) {
  if (file.kind === 'xml') {
    return declaredInPom(file, context.properties);
  }
  if (file.kind === 'toml') {
    const entry = legacyDeclaration(withoutComments(file.text, 'toml'));
    return { entries: entry === undefined ? [] : [entry], notes: [] };
  }
  return declaredInCode(file, context);
}

function pluralityDeclaration(declarations, notes) {
  const counts = Object.groupBy(declarations, ({ formatter }) => formatter);
  const ranked = Object.entries(counts).sort(([, left], [, right]) => right.length - left.length);
  const [first, second] = ranked;
  if (first === undefined || second?.[1].length === first[1].length) {
    return undefined;
  }
  const clash = disagree(first[1]);
  if (clash !== undefined) {
    notes.push(
      `The build files declare ${first[0]}-java-format with different versions or options; using the one in ${clash.file}`,
    );
  }
  return {
    formatter: first[0],
    aosp: first[1].some(({ aosp }) => aosp === true),
    ...mergedDetails(first[1]),
  };
}

function readingContext(source, files) {
  const poms = files.filter(({ kind }) => kind === 'xml');
  const roots = poms.flatMap(({ text }) => {
    const { root } = parsedPom(text);
    return root === undefined ? [] : [root];
  });
  const catalog = files.find(({ file }) => file.endsWith('libs.versions.toml'))?.text;
  return {
    properties: pomProperties(roots.toReversed()),
    catalog,
    gradleProperties: source.readMany(['gradle.properties']).get('gradle.properties'),
  };
}

export function declaredJavaFormatter(source) {
  const { files, skipped } = buildFiles(source);
  const context = readingContext(source, files);
  const notes = [];
  const results = files.map((file) => ({ file: file.file, ...declaredIn(file, context) }));
  const declarations = results.flatMap(({ file, entries, notes: found }) => {
    notes.push(...found);
    const declaration = fileDeclaration(file, entries, notes);
    return declaration === undefined ? [] : [declaration];
  });
  return {
    declared: pluralityDeclaration(declarations, notes),
    notes: [
      ...notes,
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
