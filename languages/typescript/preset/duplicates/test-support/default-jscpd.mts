import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldsOf, parseJson, textsOf } from '../../../../../shared/values/readers.mts';
import type { JscpdConfig } from '../../typed/tool-config/tool-config-types.mts';

export function defaultJscpd(): JscpdConfig {
  const parsed = parseJson(
    readFileSync(path.join(import.meta.dirname, '../../defaults/jscpd.json'), 'utf8'),
  );
  const fields = fieldsOf(parsed);
  return {
    ...fields,
    format: textsOf(fields['format']),
    path: textsOf(fields['path']),
    ignore: textsOf(fields['ignore']),
  };
}
