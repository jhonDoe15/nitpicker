import { configError as untypedConfigError } from '../../../shared/config.mjs';
import { precedenceLayers } from '../../../shared/conventions/tool-precedence.mjs';
import type { ConventionSource } from '../../../core/conventions/typed/convention-types.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import {
  fieldOf,
  fieldsOf,
  messageOf,
  optionalText,
  textOf,
  textsOf,
} from '../../../shared/values/readers.mts';
import { appendAll } from '../../../shared/lists/items.mjs';
import { callUntyped } from '../adapters/typed/java-values.mts';
import { PROJECT_TOOL_CONFIGS } from '../adapters/gradle-presets.mts';
import { checkstyleLineLength } from './build-style/checkstyle-width.mts';
import { declaredJavaFormatter } from './build-style/java-formatter-detection.mts';
import type { Declared } from './build-style/java-formatter-detection.mts';
import {
  JAVA_FORMATTER,
  JAVA_FORMATTER_OPTIONS,
  JAVA_FORMATTER_VERSION,
  JAVA_INDENTATION_ID,
  JAVA_LINE_LENGTH_ID,
} from './java-conventions.mts';
import { SKIP_JAVADOC, SKIP_REFLOW } from './build-style/java-formatter-options.mts';
import { declaredToolNotices } from '../adapters/tool-config/declared/declared-choices.mts';

type Choice = { choice: unknown; from: string };
type DetectedEntry = { choice: unknown; source: string | undefined; from: unknown };
type Detected = Record<string, DetectedEntry>;
type Origin = { formatter: string; aosp: boolean; declared: boolean; hard?: string };
type Contradiction = {
  id: string;
  choice: string;
  entry: DetectedEntry;
};
type Current = { current?: Declared | undefined };
type StyleSource = { config: NitpickerConfig; source: ConventionSource };

const configError: (message: string, anchor: undefined) => Error = untypedConfigError;

const FORMATTER_NAMES: Record<string, string> = {
  google: 'google-java-format',
  palantir: 'palantir-java-format',
  spring: 'Spring Java Format',
};
const PINNED = 'pinned';
const PINNED_FORMATTER = 'pinned in nitpicker.config.json';
const DECLARED_FORMATTER = 'declared in your build file';

function checkstyleChoices(
  source: ConventionSource,
  tools: NonNullable<NitpickerConfig['tools']>,
  notes: string[],
): Record<string, { choice: string; from: string }> {
  const layers = precedenceLayers(tools['checkstyle']?.precedence);
  if (!layers.usesProject || layers.nitpickerFirst) {
    return {};
  }
  const file = textOf(PROJECT_TOOL_CONFIGS.get('checkstyle'));
  const text = source.readMany([file]).get(file);
  const { max, failure } = text === undefined ? {} : checkstyleLineLength(text);
  if (failure !== undefined) {
    notes.push(`Could not read ${file}: ${failure}`);
  }
  return max === undefined
    ? {}
    : { [JAVA_LINE_LENGTH_ID]: { choice: max, from: 'your Checkstyle config' } };
}

function formatterOrigin(entry: DetectedEntry, declared: Declared | undefined): Origin {
  if (entry.source === PINNED) {
    return {
      formatter: textOf(entry.choice),
      aosp: false,
      declared: false,
      hard: PINNED_FORMATTER,
    };
  }
  return declared === undefined
    ? { formatter: textOf(entry.choice), aosp: false, declared: false }
    : { ...declared, declared: true, hard: DECLARED_FORMATTER };
}

function formatterName({ formatter, aosp }: Origin): string {
  return `${FORMATTER_NAMES[formatter] ?? ''}${aosp ? ' --aosp' : ''}`;
}

function fixedChoices({ formatter, declared, aosp }: Origin): Record<string, string> {
  if (formatter === 'palantir') {
    return { [JAVA_INDENTATION_ID]: '4', [JAVA_LINE_LENGTH_ID]: '120' };
  }
  if (formatter === 'spring') {
    return { [JAVA_INDENTATION_ID]: 'tab', [JAVA_LINE_LENGTH_ID]: '120' };
  }
  if (formatter !== 'google') {
    return {};
  }
  return {
    [JAVA_LINE_LENGTH_ID]: '100',
    ...(declared ? { [JAVA_INDENTATION_ID]: aosp ? '4' : '2' } : {}),
  };
}

function isLocked(entry: DetectedEntry | undefined): boolean {
  return [PINNED, 'project'].includes(entry?.source ?? '');
}

function contradictions(fixed: Record<string, string>, detected: Detected): Contradiction[] {
  return Object.entries(fixed).flatMap(([id, choice]) => {
    const entry = detected[id];
    return entry !== undefined && isLocked(entry) && entry.choice !== choice
      ? [{ id, choice, entry }]
      : [];
  });
}

function contradictionError(origin: Origin, { id, choice, entry }: Contradiction): Error {
  const shown = textOf(entry.choice);
  return configError(
    `"conventions.${id}" is "${shown}", but ${formatterName(origin)} (${origin.hard ?? ''}) fixes it at "${choice}". Remove the pin, or pin "conventions.${JAVA_FORMATTER}" to "none"`,
    undefined,
  );
}

function withoutFormatter({ entry, id }: Contradiction): Record<string, Choice> {
  const reason =
    entry.source === PINNED
      ? `your conventions.${id} pin in nitpicker.config.json`
      : textOf(entry.from);
  return { [JAVA_FORMATTER]: { choice: 'none', from: reason } };
}

function formatterChoices(origin: Origin, detected: Detected): Record<string, Choice> {
  const fixed = fixedChoices(origin);
  const [conflict] = contradictions(fixed, detected).filter(
    ({ entry }) => entry.source === PINNED || origin.hard === undefined,
  );
  if (conflict === undefined) {
    return Object.fromEntries(
      Object.entries(fixed)
        .filter(([id]) => !isLocked(detected[id]))
        .map(([id, choice]) => [id, { choice, from: formatterName(origin) }]),
    );
  }
  if (origin.hard === undefined) {
    return withoutFormatter(conflict);
  }
  throw contradictionError(origin, conflict);
}

const FROM_BUILD_FILE = 'your build file';

function declaredDetails(declared: Declared): Record<string, Choice> {
  return {
    ...(declared.version === undefined
      ? {}
      : { [JAVA_FORMATTER_VERSION]: { choice: declared.version, from: FROM_BUILD_FILE } }),
    ...(declared.options === undefined
      ? {}
      : { [JAVA_FORMATTER_OPTIONS]: { choice: declared.options, from: FROM_BUILD_FILE } }),
  };
}

function detectedOf(value: unknown): Detected {
  return Object.fromEntries(
    Object.entries(fieldsOf(value)).map(([id, entry]) => [
      id,
      {
        choice: fieldOf(entry, 'choice'),
        source: optionalText(fieldOf(entry, 'source')),
        from: fieldOf(entry, 'from'),
      },
    ]),
  );
}

function derivedChoices(
  detected: Detected,
  {
    source,
    notes,
    declaration,
  }: { source: ConventionSource; notes: string[]; declaration: Current },
): Record<string, Choice> {
  const entry = detected[JAVA_FORMATTER];
  if (entry === undefined) {
    return {};
  }
  const { declared, notes: found } =
    entry.source === PINNED
      ? { declared: undefined, notes: undefined }
      : declaredJavaFormatter(source);
  appendAll(notes, found ?? []);
  declaration.current = declared;
  const origin = formatterOrigin(entry, declared);
  return {
    ...(declared === undefined
      ? {}
      : {
          [JAVA_FORMATTER]: { choice: declared.formatter, from: FROM_BUILD_FILE },
          ...(declared.formatter === 'none' ? {} : declaredDetails(declared)),
        }),
    ...formatterChoices(origin, detected),
  };
}

function javadocNote({ formatter, options }: { formatter: string; options: string[] }): string {
  if (options.includes(SKIP_JAVADOC)) {
    return 'Javadoc left as written';
  }
  return formatter === 'palantir'
    ? 'Javadoc formatting (formatJavadoc) is not checked: the palantir-java-format command line cannot format it'
    : 'Javadoc formatted';
}

function formatterNote(id: string, declared: Declared | undefined): string | undefined {
  if (id !== JAVA_FORMATTER || declared === undefined) {
    return undefined;
  }
  const { version, options } = declared;
  const parts = [
    ...(version === undefined ? [] : [`version ${version}`]),
    ...(options === undefined
      ? []
      : [
          javadocNote({ formatter: declared.formatter, options }),
          options.includes(SKIP_REFLOW) ? 'long strings not reflowed' : 'long strings reflowed',
        ]),
  ];
  return parts.length === 0 ? undefined : parts.join(', ');
}

export function javaProjectStyle({ config, source }: StyleSource): {
  unused: Record<string, string>;
  project: Record<string, { choice: string; from: string }>;
  note: (id: string) => string | undefined;
  derive: (detected: unknown) => Record<string, Choice>;
  summary: () => string[];
} {
  const notes: string[] = [];
  const declaration: Current = {};
  return {
    unused: {},
    project: checkstyleChoices(source, config.tools ?? {}, notes),
    note: (id) => formatterNote(id, declaration.current),
    derive: (detected) => derivedChoices(detectedOf(detected), { source, notes, declaration }),
    summary: () => [...notes, ...toolNotices(config, source)],
  };
}

function toolNotices(config: NitpickerConfig, source: ConventionSource): string[] {
  try {
    return textsOf(callUntyped(declaredToolNotices, config, source));
  } catch (error) {
    return [`Could not read the tool settings in the build files: ${messageOf(error)}`];
  }
}
