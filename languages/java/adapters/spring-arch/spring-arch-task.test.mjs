import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../java-diff.mjs';

const script = readFileSync(INIT_SCRIPT, 'utf8');

function taskBody(name) {
  const start = script.indexOf(`tasks.register('${name}'`);
  return script.slice(start, script.indexOf('\n        }\n', start));
}

describe('nitpickerSpringArch in the init script', () => {
  it('runs as part of nitpickerJava', () => {
    const dependsOn = /dependsOn ([^\n]+)/.exec(taskBody('nitpickerJava'))[1];

    expect(dependsOn).toContain("'nitpickerSpringArch'");
  });

  it('runs only for Spring projects, so other projects skip it', () => {
    expect(taskBody('nitpickerSpringArch')).toContain('onlyIf { usesSpring() }');
  });

  it('pins the ArchUnit version it resolves', () => {
    expect(script).toMatch(/archunit\s*: '\d+\.\d+\.\d+'/);
    expect(script).toContain('"com.tngtech.archunit:archunit:${pinned.archunit}"');
  });
});
