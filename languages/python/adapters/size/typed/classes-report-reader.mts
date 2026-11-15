import {
  fieldOf,
  fieldsOf,
  listOf,
  parseJson,
  textOf,
  textsOf,
} from '../../../../../shared/values/readers.mts';
import { JSON_NULL } from '../../analysis/typed/json-null.mts';
import type {
  AliasEntry,
  ClassEntry,
  ClassesReport,
} from '../../analysis/typed/python-graph-types.mts';

function aliasOf(entry: unknown): AliasEntry {
  const module = fieldOf(entry, 'module');
  const name = fieldOf(entry, 'name');
  const asname = fieldOf(entry, 'asname');
  const level = fieldOf(entry, 'level');
  return {
    module: typeof module === 'string' ? module : JSON_NULL,
    asname: typeof asname === 'string' ? asname : JSON_NULL,
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof level === 'number' ? { level } : {}),
  };
}

function classOf(entry: unknown): ClassEntry {
  return {
    ...fieldsOf(entry),
    name: textOf(fieldOf(entry, 'name')),
    bases: textsOf(fieldOf(entry, 'bases')),
  };
}

export function classesReportOf(text: string): ClassesReport {
  return Object.fromEntries(
    Object.entries(fieldsOf(parseJson(text))).map(([file, found]) => [
      file,
      {
        classes: listOf(fieldOf(found, 'classes')).map(classOf),
        imports: listOf(fieldOf(found, 'imports')).map(aliasOf),
      },
    ]),
  );
}
