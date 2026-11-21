import path from 'node:path';
import { RULE_IDS } from '../../policy.mts';
import { escapeGlob, exceptionEntryText } from '../../messages/exception-sentence.mts';
import { exceptionMatcher } from '../exceptions.mts';
import { TEST_DATA_FOLDER, messagesFor, ratchetedFinding } from '../file-limits.mts';
import type { Finding } from '../../values/findings.mts';

type DepthFile = { readonly path: string; readonly kind?: string | undefined };
type Wording = { readonly advice: (limit: number) => string; readonly [field: string]: unknown };
type DepthOptions<File extends DepthFile = DepthFile> = {
  readonly analyzerName: string;
  readonly limit: number;
  readonly wording: Wording;
  readonly depthOf: (file: File) => number | undefined;
  readonly exceptions?: readonly unknown[] | undefined;
};
type FolderGroup = { depth: number; files: number };

export function folderDepthFindings<File extends DepthFile>(
  files: readonly File[],
  options: DepthOptions<File>,
): Finding[] {
  const isExcepted = exceptionMatcher(options.exceptions ?? []);
  const folders = new Map<string, FolderGroup>();
  for (const file of files) {
    const folder = path.posix.dirname(file.path);
    const depth = depthOfChecked(file, { depthOf: options.depthOf, isExcepted });
    if (depth !== undefined) {
      const key = `${folder}\0${String(file.kind)}`;
      folders.set(key, { depth, files: (folders.get(key)?.files ?? 0) + 1 });
    }
  }
  return [...folders]
    .filter(([, { depth }]) => depth > options.limit)
    .map(([key, folder]) => depthFinding(options, key, folder));
}

function depthOfChecked<File extends DepthFile>(
  file: File,
  {
    depthOf,
    isExcepted,
  }: {
    depthOf: DepthOptions<File>['depthOf'];
    isExcepted: (rule: string, ...candidates: string[]) => boolean;
  },
): number | undefined {
  const folder = path.posix.dirname(file.path);
  const skipped =
    (file.kind === 'test' && TEST_DATA_FOLDER.test(file.path)) ||
    isExcepted(RULE_IDS.folderDepth, file.path, folder);
  return skipped ? undefined : depthOf(file);
}

function depthFinding(
  { analyzerName, limit, wording }: DepthOptions<never>,
  key: string,
  { depth: value, files }: FolderGroup,
): Finding {
  const [folder = '', kind = ''] = key.split('\0');
  const exception = exceptionEntryText({
    rule: RULE_IDS.folderDepth,
    glob: `${escapeGlob(folder)}/**`,
  });
  const values = {
    ...wording,
    advice: wording.advice(limit),
    value,
    limit,
    exception,
    base: '{base}',
  };
  return ratchetedFinding(
    { analyzerName },
    {
      rule: RULE_IDS.folderDepth,
      path: folder,
      identity: `folder-depth:${kind}:${String(value)}`,
      key: `folder-depth:${kind}`,
      value,
      messages: messagesFor('folderDepth', values),
      pathIsFolder: true,
      folderFiles: files,
    },
  );
}
