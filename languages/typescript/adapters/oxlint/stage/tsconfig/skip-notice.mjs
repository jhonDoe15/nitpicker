import path from 'node:path';

const TYPE_AWARE_SKIPPED_RULE = 'nitpicker/type-aware-rules-skipped';
const REMOVED_OPTION = /Option '([^']+)' has been removed/u;
const DEPRECATED_OPTION = /Option '([^']+)' is deprecated/u;
const MISSING_TYPES = /Cannot find type definition file for '([^']+)'/u;
const REPLACE = 'remove or replace it.';
const INSTALL = 'install them or remove the entry.';
const ENGINE_OPT_OUT =
  'To lint with ESLint instead, set {"tools":{"eslint":{"engine":"eslint"}}} in nitpicker.config.json.';

export function typeAwareSkipNotice({ configErrors, sources, projectRoot }) {
  const context = { sources, projectRoot };
  const reasons = new Set(configErrors.map((diagnostic) => configErrorReason(diagnostic, context)));
  const message = `Type-aware rules did not run: ${[...reasons].join(' ')} ${ENGINE_OPT_OUT}`;
  const anchor = sources.slice(0, -1).findLast(({ file }) => isInside(projectRoot, file));
  if (anchor === undefined) throw new Error(message);
  return {
    filePath: path.relative(projectRoot, anchor.file).split(path.sep).join('/'),
    messages: [{ ruleId: TYPE_AWARE_SKIPPED_RULE, message, severity: 2, line: 1, column: 1 }],
  };
}

function configErrorReason({ message, help }, context) {
  const text = (help ?? message).split('\n')[0];
  const removed = REMOVED_OPTION.exec(text)?.[1];
  if (removed !== undefined) {
    return `TypeScript 7 removed tsconfig option '${removed}'${setIn(removed, context)}; ${REPLACE}`;
  }
  const deprecated = DEPRECATED_OPTION.exec(text)?.[1];
  if (deprecated !== undefined) {
    return `TypeScript 7 deprecates tsconfig option '${deprecated}'${setIn(deprecated, context)}; ${REPLACE}`;
  }
  const missingTypes = MISSING_TYPES.exec(text)?.[1];
  return missingTypes === undefined
    ? `TypeScript 7 rejects the lint tsconfig: ${text}`
    : `No type definitions found for '${missingTypes}'${setIn('types', context)}; ${INSTALL}`;
}

function setIn(option, { sources, projectRoot }) {
  const name = option.split('=')[0];
  const source = sources.findLast(({ options }) => Object.hasOwn(options, name));
  if (source === undefined) return '';
  const shown = isInside(projectRoot, source.file)
    ? path.relative(projectRoot, source.file)
    : source.file;
  return ` (set in ${shown.split(path.sep).join('/')})`;
}

function isInside(projectRoot, file) {
  const relative = path.relative(projectRoot, file);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}
