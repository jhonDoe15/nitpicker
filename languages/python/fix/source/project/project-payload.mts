import type { ProjectPayload, ProjectPayloadInput } from '../../typed/script-types.mts';
import { collectProjectFiles } from '../../typed/core-views.mts';

const PYTHON_FILE = /\.py$/u;
const TEXT_FILE = /\.(?:toml|cfg|ini|ya?ml|json|pyi|ipynb|txt)$/u;

export function projectPayload({
  projectRoot,
  files,
  read,
  accepts,
}: ProjectPayloadInput): ProjectPayload {
  const known = new Set(files.map(({ path: name }) => name));
  const { files: listed } = collectProjectFiles({
    projectRoot,
    accepts: (name: string) => PYTHON_FILE.test(name) || TEXT_FILE.test(name),
    scope: undefined,
  });
  const listedNames = listed.map(({ path: name }) => name);
  const names = [...new Set([...known, ...listedNames])].filter((name) => PYTHON_FILE.test(name));
  return {
    files: names.flatMap((name) => {
      const text = read(name);
      return text === undefined ? [] : [{ path: name, text, editable: accepts(name) }];
    }),
    texts: listedNames.flatMap((name) => {
      const text = TEXT_FILE.test(name) ? read(name) : undefined;
      return text === undefined ? [] : [text];
    }),
    targets: [...known].filter((name) => PYTHON_FILE.test(name)),
  };
}
