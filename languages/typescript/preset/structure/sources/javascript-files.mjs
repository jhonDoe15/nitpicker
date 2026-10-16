import { existsSync } from 'node:fs';
import path from 'node:path';
import { MESSAGES, RULE_IDS, renderMessage } from '../../../../../shared/policy.mjs';
import { exceptionMatcher, exceptionText } from '../../../../../shared/rules/exceptions.mjs';
import { isJavascriptPolicy } from '../../../../javascript/preset/javascript-preset.mjs';
import { globToRegExp } from '../../layout.mjs';
import { PROJECT_TSCONFIG } from '../../modules/tsconfig-files.mjs';

const RULE = RULE_IDS.javascriptInTypescriptProject;
const SCRIPT_EXTENSION = /\.(?:jsx|[cm]?js)$/u;

function typescriptName(file) {
  return file.replace(SCRIPT_EXTENSION, (extension) =>
    extension === '.jsx' ? '.tsx' : extension.replace('js', 'ts'),
  );
}

export function javascriptFileFindings({
  projectRoot,
  liveProjectRoot = projectRoot,
  analyzerName,
  layout,
  policy,
}) {
  if (isJavascriptPolicy(policy) || !existsSync(path.join(liveProjectRoot, PROJECT_TSCONFIG))) {
    return [];
  }
  const isExcepted = exceptionMatcher(policy.exceptions);
  const entryPoints = (policy.layout?.entryPoints ?? []).map(globToRegExp);
  return layout
    .projectCodeFiles(projectRoot)
    .filter(
      (file) =>
        SCRIPT_EXTENSION.test(file) &&
        !entryPoints.some((matcher) => matcher.test(file)) &&
        !isExcepted(RULE, file),
    )
    .map((file) => ({
      tool: analyzerName,
      rule: RULE,
      path: file,
      identity: RULE,
      location: { line: 1 },
      message: renderMessage(MESSAGES.javascriptInTypescriptProject, {
        path: file,
        typescript: typescriptName(file),
        exception: exceptionText(RULE, file),
      }),
      classification: 'enforceable',
    }));
}
