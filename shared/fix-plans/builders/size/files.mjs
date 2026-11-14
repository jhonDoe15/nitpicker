import {
  allowedFormOf,
  limitOf,
  measuredOf,
  targetOf,
  without,
} from '../../plan-parts/finding.mjs';
import { ALL_PRESETS, JVM_PRESETS, PYTHON_PRESETS } from '../../plan-parts/presets.mjs';
import {
  bodyIndent,
  declarationsIn,
  languageOf,
  largest,
  linesOf,
} from '../../plan-parts/source.mjs';
import { amount, readStep, stepsOf } from '../../plan-parts/steps.mjs';

const TOP_DECLARATIONS = 5;
const LISTED_FILES = 20;
const SPLIT_FILE = 'Move cohesive declarations into a new file beside this one and import them.';
const SPLIT_CLASS = 'Move a group of related members into a new class and delegate to it.';
const FLATTEN = 'Replace inheritance with a field that holds the shared behavior.';

function listNames(entries) {
  return entries.map(({ name }) => name).join(', ');
}

function classBody(lines, target, language) {
  return declarationsIn(lines, {
    language,
    from: target.startLine + 1,
    to: target.endLine,
    indent: bodyIndent(lines, target),
  });
}

function splitFile(finding, env) {
  const text = env.read(finding.path);
  const lines = text === undefined ? [] : linesOf(text);
  const language = languageOf(finding.path);
  const declarations = largest(declarationsIn(lines, { language }), TOP_DECLARATIONS);
  const value = measuredOf(finding) ?? (lines.length === 0 ? undefined : lines.length);
  const limit = limitOf(finding.message);
  const target = { path: finding.path, startLine: 1, endLine: Math.max(lines.length, 1) };
  return {
    kind: 'split-file',
    target,
    context: without({
      lines: value,
      limit,
      declarations: declarations.length === 0 ? undefined : declarations,
    }),
    steps: stepsOf(
      readStep(`${finding.path}`, amount(value, 'lines', limit)),
      declarations.length === 0
        ? 'Find declarations that belong together.'
        : `Move the largest declarations that belong together into a new file: ${listNames(declarations)}.`,
      allowedFormOf(finding, SPLIT_FILE),
      'Create the file beside this one, or in a new subfolder when the folder is near its file limit.',
      'Update the imports of every user of what moved, and keep each file under its limit.',
    ),
  };
}

function splitClass(metric) {
  return (finding, env) => {
    const text = env.read(finding.path);
    const lines = text === undefined ? [] : linesOf(text);
    const target = targetOf(finding, text);
    const members = largest(classBody(lines, target, languageOf(finding.path)), TOP_DECLARATIONS);
    const value = measuredOf(finding);
    const limit = limitOf(finding.message);
    return {
      kind: 'split-file',
      target,
      context: without({
        metric,
        value,
        limit,
        members: members.length === 0 ? undefined : members,
      }),
      steps: stepsOf(
        readStep(
          `the class at ${finding.path}:${String(target.startLine)}`,
          amount(value, metric, limit),
        ),
        members.length === 0
          ? 'Group the members that use the same fields.'
          : `Group the members that use the same fields, starting with: ${listNames(members)}.`,
        allowedFormOf(finding, SPLIT_CLASS),
        'Move each group into its own class or file and keep the public behavior.',
      ),
    };
  };
}

function flattenHierarchy(finding, env) {
  const target = targetOf(finding, env.read(finding.path));
  const value = measuredOf(finding);
  const limit = limitOf(finding.message);
  return {
    kind: 'flatten-hierarchy',
    target,
    context: without({ value, limit }),
    steps: stepsOf(
      readStep(
        `the class at ${finding.path}:${String(target.startLine)}`,
        amount(value, 'superclasses', limit),
      ),
      allowedFormOf(finding, FLATTEN),
      'Move behavior that only one subclass uses down into it, and compose the rest.',
    ),
  };
}

function moveFromFolder(finding, env) {
  const folder = finding.path;
  const siblings = env.list(folder).slice(0, LISTED_FILES);
  const value = measuredOf(finding);
  const limit = limitOf(finding.message);
  return {
    kind: 'move-module',
    target: { path: folder, startLine: 1, endLine: 1 },
    context: without({ value, limit, files: siblings.length === 0 ? undefined : siblings }),
    steps: stepsOf(
      readStep(`${folder}`, amount(value, 'files or levels', limit)),
      'Group the files by what they are for.',
      allowedFormOf(finding, 'Move each group into a folder named for what it is.'),
      'Update the imports of every moved file; the finding stops when the folder is within its limit.',
    ),
  };
}

function rules(...ruleNames) {
  return ruleNames.map((rule) => ({ tool: 'structure', rule }));
}

export const FILE_BUILDERS = [
  {
    id: 'split-file-lines',
    rules: rules('file-lines-limit'),
    presets: ALL_PRESETS,
    build: splitFile,
  },
  {
    id: 'split-class-methods',
    rules: rules('class-methods-limit'),
    presets: [...JVM_PRESETS, ...PYTHON_PRESETS],
    build: splitClass('methods'),
  },
  {
    id: 'split-class-fields',
    rules: rules('class-fields-limit'),
    presets: [...JVM_PRESETS, ...PYTHON_PRESETS],
    build: splitClass('fields'),
  },
  {
    id: 'flatten-hierarchy',
    rules: rules('inheritance-depth-limit'),
    presets: [...JVM_PRESETS, ...PYTHON_PRESETS],
    build: flattenHierarchy,
  },
  {
    id: 'move-from-folder',
    rules: rules('folder-files-limit', 'folder-depth-limit'),
    presets: ALL_PRESETS,
    build: moveFromFolder,
  },
];
