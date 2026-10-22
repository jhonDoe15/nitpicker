import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { layerCheckstyle } from './checkstyle-layers.mjs';

export function mergeCheckstyleFiles({ nitpicker, project, output, projectWins = true }) {
  const merged = layerCheckstyle({
    nitpickerText: readFileSync(nitpicker, 'utf8'),
    projectText: readFileSync(project, 'utf8'),
    projectWins,
  });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, merged);
}
