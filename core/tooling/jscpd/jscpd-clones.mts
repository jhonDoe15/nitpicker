import { fieldOf, listOf } from '../../../shared/values/readers.mts';

type CloneSide = { readonly file: string; readonly line: unknown };

type Clone = {
  readonly first: CloneSide;
  readonly second: CloneSide;
  readonly fragment: unknown;
  readonly lines: unknown;
  readonly tokens: unknown;
};

export function jscpdClones(report: unknown, configuredPaths: unknown): Clone[] {
  const paths = listOf(configuredPaths);
  const [onlyPath] = paths;
  const single =
    paths.length === 1 && typeof onlyPath === 'string' ? onlyPath.replace(/\/$/, '') : '';
  const prefix = single === '.' ? '' : single;
  return listOf(fieldOf(report, 'duplicates')).map((duplicate) => {
    const firstFile = fieldOf(duplicate, 'firstFile');
    const secondFile = fieldOf(duplicate, 'secondFile');
    return {
      first: {
        file: prefixedPath(prefix, fieldOf(firstFile, 'name')),
        line: fieldOf(firstFile, 'start'),
      },
      second: {
        file: prefixedPath(prefix, fieldOf(secondFile, 'name')),
        line: fieldOf(secondFile, 'start'),
      },
      fragment: fieldOf(duplicate, 'fragment'),
      lines: fieldOf(duplicate, 'lines'),
      tokens: fieldOf(duplicate, 'tokens'),
    };
  });
}

function prefixedPath(prefix: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Duplicate report contains an invalid file name');
  }
  const normalizedValue = value.replaceAll('\\', '/').replace(/^\.\//, '');
  return prefix.length === 0 ||
    normalizedValue === prefix ||
    normalizedValue.startsWith(`${prefix}/`)
    ? normalizedValue
    : `${prefix}/${normalizedValue}`;
}
