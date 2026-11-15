import path from 'node:path';
import type { Finding } from '../../../adapters/static-checks/shared.mts';
import {
  MESSAGES,
  RULE_IDS,
  codeExtensionNames,
  exceptionMatcher,
  exceptionText,
  isJavascriptPolicy,
  messageFields,
  projectFilesUnder,
  projectTsconfigs,
} from '../typed/rule-views.mts';
import type { StructureLayout, StructurePolicy } from '../typed/structure-types.mts';

const RULE = RULE_IDS.javascriptInTypescriptProject;
const SCRIPT_EXTENSION = new RegExp(
  `\\.(?:${codeExtensionNames.filter((extension) => extension.includes('js')).join('|')})$`,
  'u',
);
const SKIPPED_FOLDERS = new Set(['node_modules', '.git']);

function typescriptName(file: string): string {
  return file.replace(SCRIPT_EXTENSION, (extension: string) =>
    extension === '.jsx' ? '.tsx' : '.ts',
  );
}

function isTypescriptProject(projectRoot: string, layout: StructureLayout): boolean {
  const files = [
    ...projectFilesUnder(projectRoot, {
      skipDirectory: (_absolute, entry) => SKIPPED_FOLDERS.has(entry.name),
    }),
  ].map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
  return projectTsconfigs(projectRoot, files, (file) => layout.isExcluded(file)).length > 0;
}

export function javascriptFileFindings({
  projectRoot,
  liveProjectRoot = projectRoot,
  analyzerName,
  layout,
  policy,
}: {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly analyzerName: string;
  readonly layout: StructureLayout;
  readonly policy: StructurePolicy;
}): Finding[] {
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
    .map((file): Finding => ({
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
