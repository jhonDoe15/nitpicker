import { buildFiles } from './build-files.mts';
import type { BuildFile } from './build-files.mts';
import { withoutComments } from './build-comments.mts';
import { disagree, mergedDetails, stepFormatterDetails } from './java-formatter-options.mts';
import type { FormatterEntry } from './java-formatter-options.mts';
import type { FormatterStep } from './declarations/formatter-steps.mts';
import {
  formatterSteps,
  outsideSpotless,
  spotlessJavaBlocks,
} from './declarations/formatter-steps.mts';
import {
  createReading,
  flagValue,
  unquoted,
  versionValue,
} from './declarations/formatter-values.mts';
import type { Reading } from './declarations/formatter-values.mts';
import { declaredInPom, pomProperties } from './declarations/maven-formatter-declarations.mts';
import { parsedXml } from './declarations/parsed-xml.mts';
import { gradleValue } from './declarations/value-references.mts';
import {
  declaresSpringJavaFormat,
  SPRING_JAVA_FORMAT,
} from './spring-format/spring-java-format.mts';
import { appendAll } from '../../../../shared/lists/items.mjs';
import type { Optional } from '../typed/optional.mts';
import type { ConventionSource } from '../../../../core/conventions/typed/convention-types.mts';

export type Declared = FormatterEntry & { aosp: boolean };
type Declaration = Declared & { file: string };
type DeclaredFile = { entries: FormatterEntry[]; notes: string[]; failure?: string | undefined };
type Context = {
  properties: Map<string, string>;
  catalog: string | undefined;
  gradleProperties: string | undefined;
};

const PALANTIR_STYLE = 'palantir';
const GOOGLE_STYLE = 'google';
const PALANTIR = /palantirjavaformat|palantir-java-format|com\.palantir\.java-format/u;
const GOOGLE = /googlejavaformat|google-java-format|com\.spotify\.fmt/u;
const OTHER_FORMATTER = /\b(?:eclipse|prettier)\s*\(/iu;
const PREFERENCE = [PALANTIR_STYLE, GOOGLE_STYLE, SPRING_JAVA_FORMAT, 'none'];

function legacyDeclaration(code: string): FormatterEntry | undefined {
  const lower = code.toLowerCase();
  if (PALANTIR.test(lower)) {
    return { formatter: PALANTIR_STYLE };
  }
  return GOOGLE.test(lower)
    ? { formatter: GOOGLE_STYLE, aosp: GOOGLE_AOSP.test(lower) }
    : undefined;
}

function definedEntries(...entries: (FormatterEntry | undefined)[]): FormatterEntry[] {
  return entries.filter((entry): entry is FormatterEntry => entry !== undefined);
}

function springDeclaration(code: string): FormatterEntry | undefined {
  return declaresSpringJavaFormat(code) ? { formatter: SPRING_JAVA_FORMAT } : undefined;
}

const GOOGLE_AOSP =
  /googlejavaformat\s*\([^)]*\)[^;]*?\.\s*(?:aosp\s*\(|style\s*\(\s*["']aosp["'])/u;

function chainFlag(step: FormatterStep, name: string, reading: Reading): Optional<boolean> {
  const call = step.chain.find(({ name: callName }) => callName === name.toLowerCase());
  return call === undefined ? undefined : flagValue(call.argument, name, reading);
}

function stepDeclaration(step: FormatterStep, reading: Reading): FormatterEntry {
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

function declaredInCode({ file, text }: BuildFile, context: Context): DeclaredFile {
  const code = withoutComments(text, 'code');
  const blocks = spotlessJavaBlocks(code);
  const reading = createReading(file, (argument: string) =>
    gradleValue(argument, {
      text: code,
      properties: context.gradleProperties,
      catalog: context.catalog,
    }),
  );
  const steps = (blocks ?? []).flatMap(formatterSteps);
  if (steps.length > 0) {
    return {
      entries: steps.map((step) => stepDeclaration(step, reading)),
      notes: [...reading.notes],
    };
  }
  const entry =
    blocks?.some((block) => OTHER_FORMATTER.test(block)) === true
      ? { formatter: 'none' }
      : legacyDeclaration(blocks === undefined ? code : outsideSpotless(code));
  return { entries: definedEntries(entry, springDeclaration(code)), notes: [] };
}

function pickFormatter(entries: FormatterEntry[]): FormatterEntry[] | undefined {
  const present = new Set(entries.map((entry) => entry.formatter));
  const formatter = PREFERENCE.find((name) => present.has(name));
  return formatter === undefined
    ? undefined
    : entries.filter((entry) => entry.formatter === formatter);
}

function fileDeclaration(
  file: string,
  entries: FormatterEntry[],
  notes: string[],
): Declaration | undefined {
  const group = pickFormatter(entries);
  const first = group?.[0];
  if (group === undefined || first === undefined) {
    return undefined;
  }
  const clash = disagree(group);
  if (clash !== undefined) {
    notes.push(
      `${file} declares ${first.formatter}-java-format more than once with different versions or options; using the first`,
    );
  }
  return {
    file,
    formatter: first.formatter,
    aosp: group.some(({ aosp }) => aosp === true),
    ...mergedDetails(group),
  };
}

function declaredIn(file: BuildFile, context: Context): DeclaredFile {
  if (file.kind === 'xml') {
    return declaredInPom(file, context.properties);
  }
  if (file.kind === 'toml') {
    const code = withoutComments(file.text, 'toml');
    return { entries: definedEntries(legacyDeclaration(code), springDeclaration(code)), notes: [] };
  }
  return declaredInCode(file, context);
}

function pluralityDeclaration(declarations: Declaration[], notes: string[]): Declared | undefined {
  const counts = Object.groupBy(declarations, ({ formatter }) => formatter);
  const ranked = Object.entries(counts)
    .flatMap(([name, group]) => (group === undefined ? [] : [[name, group] as const]))
    .sort(([, left], [, right]) => right.length - left.length);
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
    aosp: first[1].some(({ aosp }) => aosp),
    ...mergedDetails(first[1]),
  };
}

function readingContext(source: ConventionSource, files: BuildFile[]): Context {
  const poms = files.filter(({ kind }) => kind === 'xml');
  const roots = poms.flatMap(({ text }) => {
    const { root } = parsedXml(text);
    return root === undefined ? [] : [root];
  });
  const catalog = files.find(({ file }) => file.endsWith('libs.versions.toml'))?.text;
  return {
    properties: pomProperties(roots.toReversed()),
    catalog,
    gradleProperties: source.readMany(['gradle.properties']).get('gradle.properties'),
  };
}

export function declaredJavaFormatter(source: ConventionSource): {
  declared: Declared | undefined;
  notes: string[];
} {
  const { files, skipped } = buildFiles(source);
  const context = readingContext(source, files);
  const notes: string[] = [];
  const results = files.map((file) => ({ file: file.file, ...declaredIn(file, context) }));
  const declarations = results.flatMap(({ file, entries, notes: found }) => {
    appendAll(notes, found);
    const declaration = fileDeclaration(file, entries, notes);
    return declaration === undefined ? [] : [declaration];
  });
  return {
    declared: pluralityDeclaration(declarations, notes),
    notes: [
      ...notes,
      ...results
        .filter(({ failure }) => failure !== undefined)
        .map(({ file, failure }) => `Could not read ${file}: ${failure ?? ''}`),
      ...(skipped === 0
        ? []
        : [
            `Read the first ${String(files.length)} build files and skipped ${String(skipped)} more`,
          ]),
    ],
  };
}
