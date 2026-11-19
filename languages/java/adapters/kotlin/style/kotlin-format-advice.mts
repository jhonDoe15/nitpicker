import { formatAdvice as untypedFormatAdvice } from '../../../../../shared/messages/format/format-advice.mjs';
import { ignoredConfigNotice as untypedIgnoredConfigNotice } from '../../../../../shared/conventions/tool-precedence.mjs';
import {
  KOTLIN_INDENTATION,
  KOTLIN_LINE_LENGTH,
} from '../../../conventions/kotlin-conventions.mts';
import type { KotlinTools } from '../typed/kotlin-tool-types.mts';
import { type Conventions, ktlintDefaults } from './kotlin-style-files.mts';

type FormatTools = Partial<
  Pick<
    KotlinTools,
    'formatter' | 'ktfmtStyle' | 'ktfmtMaxWidth' | 'editorconfigFiles' | 'detektIgnored'
  >
> & { ktfmtEditorconfig: boolean; editorconfigIgnored: boolean };

const formatAdvice: () => string = untypedFormatAdvice;
const ignoredConfigNotice: (ignored: string, tool: string) => string = untypedIgnoredConfigNotice;

function ktfmtLines(tools: FormatTools): string[] {
  const flags = [
    `--${tools.ktfmtStyle ?? ''}-style`,
    ...(tools.ktfmtMaxWidth === undefined ? [] : [`--max-width=${tools.ktfmtMaxWidth}`]),
    ...(tools.ktfmtEditorconfig ? ['--enable-editorconfig'] : []),
  ].join(' ');
  const ignored = [...(tools.editorconfigIgnored ? ['.editorconfig'] : [])];
  return [
    `Format with ktfmt: ktfmt ${flags} <Kotlin files>`,
    ...(ignored.length === 0 ? [] : [ignoredConfigNotice(ignored.join(' and '), 'ktfmt')]),
  ];
}

function ktlintSettings(conventions: Conventions): string {
  const defaults = ktlintDefaults(conventions);
  return defaults === undefined
    ? "ktlint's defaults"
    : defaults
        .split('\n')
        .filter((line) => line !== '' && !line.startsWith('['))
        .join(', ');
}

function followedLimits(conventions: Conventions): string[] {
  return Object.entries({
    indent_size: conventions[KOTLIN_INDENTATION],
    max_line_length: conventions[KOTLIN_LINE_LENGTH],
  })
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

function ktlintLines(tools: FormatTools, conventions: Conventions): string[] {
  const settings = ktlintSettings(conventions);
  const limits = followedLimits(conventions);
  if (tools.editorconfigFiles !== undefined) {
    return [
      `ktlint reads your .editorconfig files, and uses ${settings} where they set nothing` +
        (limits.length === 0 ? '' : `; the followed limits (${limits.join(', ')}) win over them`),
    ];
  }
  return [
    `ktlint runs with ${settings}`,
    ...(tools.editorconfigIgnored ? [ignoredConfigNotice('.editorconfig', 'ktlint')] : []),
  ];
}

function detektLines(tools: FormatTools): string[] {
  return tools.detektIgnored === undefined
    ? []
    : [ignoredConfigNotice(tools.detektIgnored, 'detekt')];
}

export function kotlinSummary(tools: FormatTools, conventions: Conventions): string[] {
  const formatter = tools.formatter === 'ktfmt' ? ktfmtLines(tools) : [];
  return [
    ...formatter,
    ...(tools.formatter === 'ktlint' ? ktlintLines(tools, conventions) : []),
    ...detektLines(tools),
  ];
}

export function kotlinFormatAdvice(tools: FormatTools): {
  ktfmt: string;
  ktlint: (ruleSwitch: string) => string;
  detekt: string | undefined;
} {
  return {
    ktfmt: formatAdvice(),
    ktlint: (ruleSwitch: string) =>
      `Run nitpicker --fix to apply the fixes ktlint has, or lift this rule with ${ruleSwitch} = disabled in .editorconfig, which nitpicker reads only when ktlint lists "project" (see the start of the run).`,
    detekt:
      tools.detektIgnored === undefined
        ? undefined
        : `Nitpicker runs detekt without your ${tools.detektIgnored} (see the start of the run).`,
  };
}
