import { fixerError, fixSpawn } from '../../../../core/fix/common/fix-command.mjs';
import { formatNotes } from '../../../../core/fix/common/fix-notes.mjs';
import { rewriteFormatted } from '../../../../core/fix/common/format-rewrite.mjs';
import { toolPrecedenceOf } from '../../../../core/fix/common/tool-precedence.mjs';
import type { FixFile, FixStep, FixWriter } from '../../../../core/fix/typed/fix-types.mts';
import { kotlinStyleFile, resolveKotlinTools } from '../../adapters/kotlin/kotlin-tools.mts';
import {
  javaFormatterFlags,
  javaFormatterSettings,
  javaStyle,
} from '../../adapters/style/java-style.mts';
import { readPinnedTools } from '../../builds/java-build.mts';
import { formatterJava } from '../../maven/errorprone/maven-jdk.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, optionalText, textOf, textsOf } from '../../../../shared/values/readers.mts';
import type { Environment } from '../../../../shared/processes/environment.mts';
import { type Classpaths, resolveToolClasspaths } from '../tools/tool-classpath.mts';
import type { FormatterPlan } from './formatter-run.mts';
import { javaFormat, javaFormatterPlan } from './java-format.mts';
import { kotlinFormat, kotlinFormatterPlan } from './kotlin-format.mts';

export type FormatSettings = {
  readonly projectRoot: string;
  readonly repositoryRoot: string;
  readonly headPolicy: unknown;
  readonly config: unknown;
  readonly writer: FixWriter;
  readonly allFiles: boolean;
  readonly environment?: Environment | undefined;
  readonly executeFixCommand: unknown;
};
type FormatStep = {
  readonly files: readonly FixFile[];
  readonly plan: FormatterPlan;
  readonly touchedLinesOnly: boolean;
  readonly formatWith: (classpaths: Classpaths) => unknown;
};
type Planned = FixStep & { readonly step: FormatStep | undefined };

const JAVA_FILE = /\.java$/u;
const KOTLIN_FILE = /\.kt$/u;
const CONVENTIONS = 'conventions';
const FORMATTER = 'formatter';
const NO_JAVA_FORMATTER =
  'No Java formatter runs for this project (conventions "java.formatter" is "none"), so Java files were not rewritten';
const BUILD_JAVA_FORMATTER =
  'The build enforces Spring Java Format (conventions "java.formatter" is "spring"), which nitpicker does not run, so Java files were not rewritten: run its apply goal or format task';
const NO_KOTLIN_FORMATTER =
  'No Kotlin formatter found, so Kotlin files were not rewritten: set "kotlin.formatter" to "ktlint" or "ktfmt" in nitpicker.config.json to format them';

function javaStep(
  settings: FormatSettings,
  files: readonly FixFile[],
  pinned: unknown,
): FormatStep | string {
  const { headPolicy, executeFixCommand } = settings;
  const conventions = fieldOf(headPolicy, CONVENTIONS);
  const style = textOf(javaStyle(conventions));
  const version = fieldOf(callUntyped(javaFormatterSettings, conventions), 'version');
  const plan = javaFormatterPlan(style, pinned, version);
  if (plan === undefined) {
    return style === 'spring' ? BUILD_JAVA_FORMATTER : NO_JAVA_FORMATTER;
  }
  return {
    files,
    plan,
    touchedLinesOnly: false,
    formatWith: (classpaths: Classpaths) =>
      javaFormat({
        style,
        flags: textsOf(callUntyped(javaFormatterFlags, conventions)),
        classpath: classpaths['java-format'],
        java: callUntyped(formatterJava, {
          tool: plan.label,
          spawn: callUntyped(fixSpawn, { operation: 'java-probe', executeFixCommand }),
          environment: settings.environment ?? {},
        }),
        executeFixCommand,
      }),
  };
}

function kotlinTools(settings: FormatSettings): unknown {
  const { projectRoot, headPolicy, config } = settings;
  const kotlin = fieldOf(config, 'kotlin');
  return callUntyped(resolveKotlinTools, projectRoot, {
    formatter: fieldOf(fieldOf(headPolicy, 'kotlin'), FORMATTER) ?? fieldOf(kotlin, FORMATTER),
    detektConfig: fieldOf(kotlin, 'detektConfig'),
    conventions: fieldOf(headPolicy, CONVENTIONS) ?? {},
    policyRoot: projectRoot,
    toolPrecedence: callUntyped(toolPrecedenceOf, fieldOf(headPolicy, 'tools')),
  });
}

function kotlinStep(
  settings: FormatSettings,
  files: readonly FixFile[],
  pinned: unknown,
): FormatStep | string {
  const tools = kotlinTools(settings);
  const formatter = fieldOf(tools, FORMATTER);
  const plan = kotlinFormatterPlan(formatter, pinned);
  const conventions = fieldOf(settings.headPolicy, CONVENTIONS) ?? {};
  const style = callUntyped(kotlinStyleFile, tools, conventions);
  if (plan === undefined) {
    return NO_KOTLIN_FORMATTER;
  }
  return {
    files,
    plan,
    touchedLinesOnly: formatter === 'ktlint',
    formatWith: (classpaths: Classpaths) =>
      kotlinFormat({
        formatter,
        tools,
        style,
        classpath: classpaths[textOf(formatter)],
        executeFixCommand: settings.executeFixCommand,
      }),
  };
}

function fixerErrors(tool: string, error: unknown): FixStep {
  return { toolErrors: [callUntyped(fixerError, tool, error)], notes: [] };
}

function planned(tool: string, build: () => FormatStep | string): Planned {
  try {
    const built = build();
    return typeof built === 'string'
      ? { toolErrors: [], notes: [built], step: undefined }
      : { toolErrors: [], notes: [], step: built };
  } catch (error) {
    return { ...fixerErrors(tool, error), step: undefined };
  }
}

function plannedSteps(settings: FormatSettings, files: readonly FixFile[]): Planned[] {
  const pinned: unknown = readPinnedTools();
  const javaFiles = files.filter(({ path: name }) => JAVA_FILE.test(name));
  const kotlinFiles = files.filter(({ path: name }) => KOTLIN_FILE.test(name));
  return [
    ...(javaFiles.length === 0
      ? []
      : [planned('java-format-fix', () => javaStep(settings, javaFiles, pinned))]),
    ...(kotlinFiles.length === 0
      ? []
      : [planned('kotlin-format-fix', () => kotlinStep(settings, kotlinFiles, pinned))]),
  ];
}

function applyStep(step: FormatStep, classpaths: Classpaths, scope: object): FixStep {
  try {
    const rewritten = callUntyped(rewriteFormatted, {
      ...scope,
      files: step.files,
      format: step.formatWith(classpaths),
      touchedLinesOnly: step.touchedLinesOnly,
      tool: step.plan.label,
    });
    return { toolErrors: [], notes: textsOf(callUntyped(formatNotes, step.plan.label, rewritten)) };
  } catch (error) {
    return fixerErrors(step.plan.operation, error);
  }
}

function rewriteScope(settings: FormatSettings, mergeBaseSha: string | undefined): object {
  const { projectRoot, repositoryRoot, writer, allFiles } = settings;
  return { projectRoot, repositoryRoot, mergeBaseSha, writer, allFiles };
}

function classpathsFor(settings: FormatSettings, active: readonly FormatStep[]): Classpaths {
  return active.length === 0
    ? {}
    : resolveToolClasspaths({
        projectRoot: settings.projectRoot,
        buildTool: optionalText(fieldOf(fieldOf(settings.config, 'java'), 'buildTool')),
        environment: settings.environment,
        executeFixCommand: settings.executeFixCommand,
        tools: Object.fromEntries(active.flatMap(({ plan }) => Object.entries(plan.tools))),
      });
}

export function formatSteps(
  settings: FormatSettings,
  files: readonly FixFile[],
  mergeBaseSha: string | undefined,
): FixStep[] {
  const steps = plannedSteps(settings, files);
  const unplanned = steps.filter(({ step }) => step === undefined);
  const active = steps.flatMap(({ step }) => (step === undefined ? [] : [step]));
  let classpaths: Classpaths;
  try {
    classpaths = classpathsFor(settings, active);
  } catch (error) {
    return [...unplanned, fixerErrors('fix-tools', error)];
  }
  const scope = rewriteScope(settings, mergeBaseSha);
  return [...unplanned, ...active.map((step) => applyStep(step, classpaths, scope))];
}
