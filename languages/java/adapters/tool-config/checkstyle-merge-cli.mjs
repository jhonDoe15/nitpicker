import { readFileSync, writeFileSync } from 'node:fs';
import { layerCheckstyle } from './checkstyle-layers.mjs';

const [nitpicker, project, output, order] = process.argv.slice(2);

try {
  writeFileSync(
    output,
    layerCheckstyle({
      nitpickerText: readFileSync(nitpicker, 'utf8'),
      projectText: readFileSync(project, 'utf8'),
      projectWins: order !== 'nitpicker-first',
    }),
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
