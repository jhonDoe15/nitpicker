import { configError } from '../../../shared/config.mjs';
import { precedenceLayers } from '../../../shared/conventions/tool-precedence.mjs';
import { PROJECT_TOOL_CONFIGS } from '../adapters/gradle-presets.mjs';
import { checkstyleLineLength } from './build-style/checkstyle-width.mjs';
import { declaredJavaFormatter } from './build-style/java-formatter-detection.mjs';
import { JAVA_FORMATTER, JAVA_INDENTATION_ID, JAVA_LINE_LENGTH_ID } from './java-conventions.mjs';

const FORMATTER_NAMES = {
  google: 'google-java-format',
  palantir: 'palantir-java-format',
};
const PINNED_FORMATTER = 'pinned in nitpicker.config.json';
const DECLARED_FORMATTER = 'declared in your build file';

function checkstyleChoices(source, tools, notes) {
  const layers = precedenceLayers(tools.checkstyle?.precedence);
  if (!layers.usesProject || layers.nitpickerFirst) {
    return {};
  }
  const file = PROJECT_TOOL_CONFIGS.get('checkstyle');
  const text = source.readMany([file]).get(file);
  const { max, failure } = text === undefined ? {} : checkstyleLineLength(text);
  if (failure !== undefined) {
    notes.push(`Could not read ${file}: ${failure}`);
  }
  return max === undefined
    ? {}
    : { [JAVA_LINE_LENGTH_ID]: { choice: max, from: 'your Checkstyle config' } };
}

function formatterOrigin(entry, declared) {
  if (entry.source === 'pinned') {
    return { formatter: entry.choice, aosp: false, declared: false, hard: PINNED_FORMATTER };
  }
  return declared === undefined
    ? { formatter: entry.choice, aosp: false, declared: false }
    : { ...declared, declared: true, hard: DECLARED_FORMATTER };
}

function formatterName({ formatter, aosp }) {
  return `${FORMATTER_NAMES[formatter]}${aosp ? ' --aosp' : ''}`;
}

function fixedChoices({ formatter, declared, aosp }) {
  if (formatter === 'palantir') {
    return { [JAVA_INDENTATION_ID]: '4', [JAVA_LINE_LENGTH_ID]: '120' };
  }
  if (formatter !== 'google') {
    return {};
  }
  return {
    [JAVA_LINE_LENGTH_ID]: '100',
    ...(declared ? { [JAVA_INDENTATION_ID]: aosp ? '4' : '2' } : {}),
  };
}

function contradictions(fixed, detected) {
  return Object.entries(fixed)
    .filter(([id]) => ['pinned', 'project'].includes(detected[id].source))
    .filter(([id, choice]) => detected[id].choice !== choice)
    .map(([id, choice]) => ({ id, choice, entry: detected[id] }));
}

function contradictionError(origin, { id, choice, entry }) {
  return configError(
    `"conventions.${id}" is "${entry.choice}", but ${formatterName(origin)} (${origin.hard}) fixes it at "${choice}". Remove the pin, or pin "conventions.${JAVA_FORMATTER}" to "none"`,
  );
}

function withoutFormatter({ entry, id }) {
  const reason =
    entry.source === 'pinned' ? `your conventions.${id} pin in nitpicker.config.json` : entry.from;
  return { [JAVA_FORMATTER]: { choice: 'none', from: reason } };
}

function formatterChoices(origin, detected) {
  const fixed = fixedChoices(origin);
  const [conflict] = contradictions(fixed, detected).filter(
    ({ entry }) => entry.source === 'pinned' || origin.hard === undefined,
  );
  if (conflict === undefined) {
    return Object.fromEntries(
      Object.entries(fixed)
        .filter(([id]) => !['pinned', 'project'].includes(detected[id].source))
        .map(([id, choice]) => [id, { choice, from: formatterName(origin) }]),
    );
  }
  if (origin.hard === undefined) {
    return withoutFormatter(conflict);
  }
  throw contradictionError(origin, conflict);
}

function derivedChoices(detected, source, notes) {
  const entry = detected[JAVA_FORMATTER];
  const { declared, notes: found } = entry.source === 'pinned' ? {} : declaredJavaFormatter(source);
  notes.push(...(found ?? []));
  const origin = formatterOrigin(entry, declared);
  return {
    ...(declared === undefined
      ? {}
      : { [JAVA_FORMATTER]: { choice: declared.formatter, from: 'your build file' } }),
    ...formatterChoices(origin, detected),
  };
}

export function javaProjectStyle({ config, source }) {
  const notes = [];
  return {
    unused: {},
    project: checkstyleChoices(source, config.tools ?? {}, notes),
    note: () => undefined,
    derive: (detected) => derivedChoices(detected, source, notes),
    summary: () => notes,
  };
}
