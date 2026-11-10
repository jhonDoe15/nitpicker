import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathInside } from '../../../../../../../shared/filesystem.mjs';

export function schemaProject(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-foreign-keys-'));
  for (const [name, text] of Object.entries(files)) {
    const file = pathInside(root, name);
    if (file === undefined) {
      throw new RangeError(`${name} is outside the project`);
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}
