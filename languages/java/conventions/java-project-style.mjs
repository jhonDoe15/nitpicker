import { configError } from '../../../shared/config.mjs';
import { readInside } from '../../../shared/conventions/read-inside.mjs';
import { precedenceLayers } from '../../../shared/conventions/tool-precedence.mjs';
import { PROJECT_TOOL_CONFIGS } from '../adapters/gradle-presets.mjs';
import { checkstyleLineLength, declaredJavaFormatter } from './java-formatter-detection.mjs';
import { JAVA_FORMATTER, JAVA_INDENTATION_ID, JAVA_LINE_LENGTH_ID } from './java-conventions.mjs';

const FORMATTER_NAMES = {
  google: 'google-java-format',
  palantir: 'palantir-java-format',
};
const FIXED_BY_FORMATTER = {
  google: { [JAVA_LINE_LENGTH_ID]: '100' },
  palantir: { [JAVA_INDENTATION_ID]: '4', [JAVA_LINE_LENGTH_ID]: '120' },
};

function checkstyleChoices(projectRoot, tools) {
  const layers = precedenceLayers(tools.checkstyle?.precedence);
  if (!layers.usesProject || layers.nitpickerFirst) {
    return {};
  }
  const text = readInside(projectRoot, PROJECT_TOOL_CONFIGS.get('checkstyle'), 'utf8');
  const max = text === undefined ? undefined : checkstyleLineLength(text);
  return max === undefined
    ? {}
    : { [JAVA_LINE_LENGTH_ID]: { choice: max, from: 'your Checkstyle config' } };
}

function fixedChoice({ id, choice, entry, formatter }) {
  if (entry.source === 'project' || (entry.source === 'pinned' && entry.choice === choice)) {
    return [];
  }
  if (entry.source === 'pinned') {
    throw configError(
      `"conventions.${id}" is "${entry.choice}", but ${FORMATTER_NAMES[formatter]} fixes it at "${choice}". Remove the pin, or pin "conventions.${JAVA_FORMATTER}" to "none"`,
    );
  }
  return [[id, { choice, from: FORMATTER_NAMES[formatter] }]];
}

function formatterChoice(detected, projectRoot) {
  const declared =
    detected[JAVA_FORMATTER].source === 'pinned' ? undefined : declaredJavaFormatter(projectRoot);
  return declared === undefined
    ? {}
    : { [JAVA_FORMATTER]: { choice: declared, from: 'your build file' } };
}

function derivedChoices(detected, projectRoot) {
  const declared = formatterChoice(detected, projectRoot);
  const formatter = declared[JAVA_FORMATTER]?.choice ?? detected[JAVA_FORMATTER].choice;
  const fixed = Object.entries(FIXED_BY_FORMATTER[formatter] ?? {}).flatMap(([id, choice]) =>
    fixedChoice({ id, choice, entry: detected[id], formatter }),
  );
  return { ...declared, ...Object.fromEntries(fixed) };
}

export function javaProjectStyle({ config, projectRoot }) {
  return {
    unused: {},
    project: checkstyleChoices(projectRoot, config.tools ?? {}),
    note: () => undefined,
    derive: (detected) => derivedChoices(detected, projectRoot),
  };
}
