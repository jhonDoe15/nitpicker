import { readFileSync, writeFileSync } from 'node:fs';
import { layerCheckstyle } from './checkstyle-layers.mjs';

export function mergeCheckstyleFiles([nitpicker, project, output, order]) {
  try {
    writeFileSync(
      output,
      layerCheckstyle({
        nitpickerText: readFileSync(nitpicker, 'utf8'),
        projectText: readFileSync(project, 'utf8'),
        projectWins: order !== 'nitpicker-first',
      }),
    );
    return { code: 0, message: '' };
  } catch (error) {
    return { code: 1, message: error instanceof Error ? error.message : String(error) };
  }
}
