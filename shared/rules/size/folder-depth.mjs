import path from 'node:path';
import { RULE_IDS } from '../../policy.mjs';
import { escapeGlob, exceptionEntryText } from '../../messages/exception-sentence.mjs';
import { exceptionMatcher } from '../exceptions.mjs';
import { TEST_DATA_FOLDER, messagesFor, ratchetedFinding } from '../file-limits.mjs';

export function folderDepthFindings(files, options) {
  const isExcepted = exceptionMatcher(options.exceptions ?? []);
  const folders = new Map();
  for (const file of files) {
    const folder = path.posix.dirname(file.path);
    const depth = depthOfChecked(file, { depthOf: options.depthOf, isExcepted });
    if (depth !== undefined) {
      const key = `${folder}\0${file.kind}`;
      folders.set(key, { depth, files: (folders.get(key)?.files ?? 0) + 1 });
    }
  }
  return [...folders]
    .filter(([, { depth }]) => depth > options.limit)
    .map(([key, folder]) => depthFinding(options, key, folder));
}

function depthOfChecked(file, { depthOf, isExcepted }) {
  const folder = path.posix.dirname(file.path);
  const skipped =
    (file.kind === 'test' && TEST_DATA_FOLDER.test(file.path)) ||
    isExcepted(RULE_IDS.folderDepth, file.path, folder);
  return skipped ? undefined : depthOf(file);
}

function depthFinding({ analyzerName, limit, wording }, key, { depth: value, files }) {
  const [folder, kind] = key.split('\0');
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
