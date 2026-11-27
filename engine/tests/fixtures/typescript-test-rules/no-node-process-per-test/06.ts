import { spawnSync } from 'node:child_process';
const dependencyCruiser = path.join(projectRoot, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs');
function cruiseFixture(name) {
  return spawnSync(process.execPath, [dependencyCruiser, name, '--output-type', 'err-long'], { encoding: 'utf8' });
}
it.each(violations)('%s', (name) => { expect(cruiseFixture(name).status).toBe(1); });