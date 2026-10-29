import { fixerError } from '../../../core/fix/common/fix-command.mjs';
import {
  collectFixFiles,
  excludedBy,
  readBytes,
  rewrittenPaths,
} from '../../../core/fix/common/fix-files.mjs';
import { formatNotes } from '../../../core/fix/common/fix-notes.mjs';
import { rewriteFormatted } from '../../../core/fix/common/format-rewrite.mjs';
import { toolPrecedenceOf } from '../../../core/fix/common/tool-precedence.mjs';
import { isGeneratedJvm } from '../adapters/generated/generated-sources.mjs';
import { kotlinStyleFile, resolveKotlinTools } from '../adapters/kotlin/kotlin-tools.mjs';
import { declaredSourceRoots } from '../adapters/notices/declared-roots.mjs';
import { inJvmSourceSets } from '../adapters/notices/outside-roots-notice.mjs';
import { javaStyle } from '../adapters/style/java-style.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';
import { javaFormat, javaFormatterPlan } from './java-format.mjs';
import { kotlinFormat, kotlinFormatterPlan } from './kotlin-format.mjs';
import { resolveToolClasspaths } from './tools/tool-classpath.mjs';

const JAVA_FILE = /\.java$/u;
const KOTLIN_FILE = /\.kt$/u;
const NO_JAVA_FORMATTER =
  'No Java formatter runs for this project (conventions "java.formatter" is "none"), so Java files were not rewritten';
const NO_KOTLIN_FORMATTER =
  'No Kotlin formatter found, so Kotlin files were not rewritten: set "kotlin.formatter" to "ktlint" or "ktfmt" in nitpicker.config.json to format them';

function javaStep(settings, files, pinned) {
  const { headPolicy, executeFixCommand } = settings;
  const style = javaStyle(headPolicy.conventions);
  const plan = javaFormatterPlan(style, pinned);
  return plan === undefined
    ? { notes: [NO_JAVA_FORMATTER] }
    : {
        files,
        plan,
        formatWith: (classpaths) =>
          javaFormat({ style, classpath: classpaths['java-format'], executeFixCommand }),
      };
}

function kotlinStep(settings, files, pinned) {
  const { projectRoot, headPolicy, config, executeFixCommand } = settings;
  const conventions = headPolicy.conventions ?? {};
  const tools = resolveKotlinTools(projectRoot, {
    formatter: headPolicy.kotlin?.formatter ?? config.kotlin?.formatter,
    detektConfig: config.kotlin?.detektConfig,
    conventions,
    policyRoot: projectRoot,
    toolPrecedence: toolPrecedenceOf(headPolicy.tools),
  });
  const plan = kotlinFormatterPlan(tools.formatter, pinned);
  const style = kotlinStyleFile(tools, conventions);
  return plan === undefined
    ? { notes: [NO_KOTLIN_FORMATTER] }
    : {
        files,
        plan,
        formatWith: (classpaths) =>
          kotlinFormat({
            formatter: tools.formatter,
            tools,
            style,
            classpath: classpaths[tools.formatter],
            executeFixCommand,
          }),
      };
}

function attempt(tool, step) {
  try {
    return { toolErrors: [], notes: [], ...step() };
  } catch (error) {
    return { toolErrors: [fixerError(tool, error)], notes: [] };
  }
}

function plannedSteps(settings, files) {
  const pinned = readPinnedTools();
  const javaFiles = files.filter(({ path: name }) => JAVA_FILE.test(name));
  const kotlinFiles = files.filter(({ path: name }) => KOTLIN_FILE.test(name));
  return [
    ...(javaFiles.length === 0
      ? []
      : [attempt('java-format-fix', () => javaStep(settings, javaFiles, pinned))]),
    ...(kotlinFiles.length === 0
      ? []
      : [attempt('kotlin-format-fix', () => kotlinStep(settings, kotlinFiles, pinned))]),
  ];
}

function applyStep(step, classpaths, scope) {
  return attempt(step.plan.operation, () => ({
    notes: formatNotes(
      step.plan.label,
      rewriteFormatted({
        ...scope,
        files: step.files,
        format: step.formatWith(classpaths),
      }),
    ),
  }));
}

function rewriteScope({ projectRoot, repositoryRoot }, mergeBaseSha) {
  return { projectRoot, repositoryRoot, mergeBaseSha };
}

function runSteps(settings, steps, mergeBaseSha) {
  const active = steps.filter(({ plan }) => plan !== undefined);
  const resolved = attempt('fix-tools', () => ({
    classpaths:
      active.length === 0
        ? {}
        : resolveToolClasspaths({
            projectRoot: settings.projectRoot,
            environment: settings.environment,
            executeFixCommand: settings.executeFixCommand,
            tools: Object.assign({}, ...active.map(({ plan }) => plan.tools)),
          }),
  }));
  if (resolved.classpaths === undefined) {
    return [...steps.filter(({ plan }) => plan === undefined), resolved];
  }
  return [
    ...steps.filter(({ plan }) => plan === undefined),
    ...active.map((step) =>
      applyStep(step, resolved.classpaths, rewriteScope(settings, mergeBaseSha)),
    ),
  ];
}

export function fixJvm(settings) {
  const { repositoryRoot, projectRoot, baseRef, config = {} } = settings;
  const headPolicy = settings.headPolicy ?? {};
  const excluded = excludedBy(headPolicy.exclude);
  const withKotlin = config.preset === 'kotlin';
  const roots = declaredSourceRoots(projectRoot);
  const { comparison, files } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    accepts: (name) =>
      (JAVA_FILE.test(name) || (withKotlin && KOTLIN_FILE.test(name))) &&
      !excluded(name) &&
      inJvmSourceSets(name, roots) &&
      !isGeneratedJvm(projectRoot, name),
  });
  if (files.length === 0) {
    return { fixedFiles: [], toolErrors: [], notes: [] };
  }
  const before = readBytes(projectRoot, files);
  const resolved = { ...settings, headPolicy, config };
  const outcomes = runSteps(resolved, plannedSteps(resolved, files), comparison.mergeBaseSha);
  return {
    fixedFiles: rewrittenPaths(projectRoot, files, before),
    toolErrors: outcomes.flatMap(({ toolErrors = [] }) => toolErrors),
    notes: outcomes.flatMap(({ notes = [] }) => notes),
  };
}
