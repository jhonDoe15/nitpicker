import path from 'node:path';
import { filesUnder } from '../../../../../shared/filesystem.mjs';
import { MESSAGES, RULE_IDS, messageFields } from '../../../../../shared/policy.mjs';
import { exceptionMatcher, exceptionText } from '../../../../../shared/rules/exceptions.mjs';
import { isJavascriptPolicy } from '../../../../javascript/preset/javascript-preset.mjs';
import { codeExtensionNames } from '../../layout.mjs';
import { projectTsconfigs } from '../../modules/tsconfig-files.mjs';

const RULE = RULE_IDS.javascriptInTypescriptProject;
const SCRIPT_EXTENSION = new RegExp(
  `\\.(?:${codeExtensionNames.filter((extension) => extension.includes('js')).join('|')})$`,
  'u',
);
const SKIPPED_FOLDERS = new Set(['node_modules', '.git']);

function typescriptName(file) {
  return file.replace(SCRIPT_EXTENSION, (extension) => (extension === '.jsx' ? '.tsx' : '.ts'));
}

function isTypescriptProject(projectRoot, layout) {
  const files = [
    ...filesUnder(projectRoot, {
      skipDirectory: (_absolute, entry) => SKIPPED_FOLDERS.has(entry.name),
    }),
  ].map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
  return projectTsconfigs(projectRoot, files, layout.isExcluded).length > 0;
}

export function javascriptFileFindings({
  projectRoot,
  liveProjectRoot = projectRoot,
  analyzerName,
  layout,
  policy,
}) {
  if (isJavascriptPolicy(policy) || !isTypescriptProject(liveProjectRoot, layout)) {
    return [];
  }
  const isExcepted = exceptionMatcher(policy.exceptions);
  return layout
    .projectCodeFiles(projectRoot)
    .filter(
      (file) =>
        SCRIPT_EXTENSION.test(file) && !layout.isTestFixture(file) && !isExcepted(RULE, file),
    )
    .map((file) => ({
      tool: analyzerName,
      rule: RULE,
      path: file,
      identity: RULE,
      location: { line: 1 },
      ...messageFields(MESSAGES.javascriptInTypescriptProject, {
        path: file,
        typescript: typescriptName(file),
        exception: exceptionText(RULE, file),
      }),
      classification: 'enforceable',
    }));
}
