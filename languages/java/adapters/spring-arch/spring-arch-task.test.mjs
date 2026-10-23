import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';

const script = readFileSync(INIT_SCRIPT, 'utf8');

function taskBody(name) {
  const start = script.indexOf(`tasks.register('${name}'`);
  return script.slice(start, script.indexOf('\n        }\n', start));
}

describe('nitpickerSpringArch in the init script', () => {
  it('runs as part of nitpickerJava', () => {
    const dependsOn = /dependsOn ((?:'[^'\n]+',\s*)*'[^'\n]+')/.exec(taskBody('nitpickerJava'))[1];

    expect(dependsOn.split(/,\s*/u).map((task) => task.replaceAll("'", ''))).toEqual([
      'nitpickerPmd',
      'nitpickerSpotbugs',
      'nitpickerErrorProne',
      'nitpickerFormat',
      'nitpickerJacoco',
      'nitpickerArchunit',
      'nitpickerSpringArch',
      'nitpickerStructure',
      'nitpickerPit',
    ]);
  });

  it('runs only for Spring or jMolecules projects, so other projects skip it', () => {
    expect(/onlyIf \{[^}]*\}/.exec(taskBody('nitpickerSpringArch'))[0]).toBe(
      'onlyIf { runsArchRules() }',
    );
  });

  it('tells the reader through the manifest that the rules ran', () => {
    expect(/springArch\s*: ([^,\n]+)/.exec(taskBody('nitpickerJava'))[1]).toBe('runsArchRules()');
  });

  it('resolves the pinned ArchUnit version', () => {
    expect(/archunit\s*: '([^']+)'/.exec(script)[1]).toBe('1.5.1');
    expect(/nitpickerSpringArch "([^"]+)"/.exec(script)[1]).toBe(
      'com.tngtech.archunit:archunit:${pinned.archunit}',
    );
  });
});
