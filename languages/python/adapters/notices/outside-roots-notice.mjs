import { outsideRootsNotice } from '../../../../shared/notices/outside-roots-message.mjs';
import { globToRegExp } from '../../../../shared/glob.mjs';
import { isUnder } from '../analysis/python-sources.mjs';
import { isGeneratedPython } from '../../libraries/generated-files.mjs';
import {
  DOCUMENTATION_DIRECTORIES,
  INSTALLED_DIRECTORIES,
  NON_SOURCE_FILES,
} from '../execution/python-project.mjs';

const PYTHON_FILE = /\.pyi?$/u;
const HIDDEN_FOLDER = /(?:^|\/)\.[^/]+\//u;
const TOOL_FILES = new Set(['setup.py', 'noxfile.py', 'manage.py', 'tasks.py', 'conf.py']);
const SKIPPED_FOLDERS = new Set([
  ...INSTALLED_DIRECTORIES,
  ...DOCUMENTATION_DIRECTORIES,
  'build',
  'dist',
  'env',
  'venv',
]);

function isQuiet(file) {
  const parts = file.split('/');
  return (
    HIDDEN_FOLDER.test(file) ||
    parts.slice(0, -1).some((part) => SKIPPED_FOLDERS.has(part)) ||
    NON_SOURCE_FILES.has(parts.at(-1)) ||
    TOOL_FILES.has(parts.at(-1))
  );
}

export function pythonOutsideRootsNotices(changedFiles, project) {
  const { projectRoot, sourceRoots, exclude = [], isTestFile } = project;
  const excluded = exclude.map((glob) => globToRegExp(glob));
  const outside = [...changedFiles]
    .map((file) => file.replaceAll('\\', '/'))
    .filter(
      (file) =>
        PYTHON_FILE.test(file) &&
        !isQuiet(file) &&
        !isTestFile(file) &&
        !excluded.some((matcher) => matcher.test(file)) &&
        !sourceRoots.some((root) => isUnder(file, root)) &&
        !isGeneratedPython(projectRoot, file),
    );
  return outsideRootsNotice({
    files: outside,
    kind: 'Python',
    where: 'python.sourceRoots',
    effect: 'so only the lint and format checks see {them}',
    destination: 'under a source root or add {their} to python.sourceRoots',
  });
}
