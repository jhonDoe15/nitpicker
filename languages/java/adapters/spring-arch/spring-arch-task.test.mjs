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
    const dependsOn = [
      ...taskBody('nitpickerJava').matchAll(/dependsOn ((?:'[^'\n]+',\s*)*'[^'\n]+')/gu),
    ].flatMap(([, names]) => names.split(/,\s*/u).map((task) => task.replaceAll("'", '')));

    expect(dependsOn).toEqual([
      'nitpickerPmd',
      'nitpickerSpotbugs',
      'nitpickerErrorProne',
      'nitpickerFormat',
      'nitpickerSpringArch',
      'nitpickerStructure',
      'nitpickerJacoco',
      'nitpickerArchunit',
      'nitpickerPit',
    ]);
  });

  it('runs only for Spring projects, so other projects skip it', () => {
    expect(/onlyIf \{[^}]*\}/.exec(taskBody('nitpickerSpringArch'))[0]).toBe(
      'onlyIf { usesSpring() }',
    );
  });

  it('tells the reader through the manifest that the rules ran', () => {
    expect(/springArch\s*: ([^,\n]+)/.exec(taskBody('nitpickerJava'))[1]).toBe('usesSpring()');
  });

  it('resolves the pinned ArchUnit version', () => {
    expect(/archunit\s*: '([^']+)'/.exec(script)[1]).toBe('1.5.1');
    expect(/nitpickerSpringArch "([^"]+)"/.exec(script)[1]).toBe(
      'com.tngtech.archunit:archunit:${pinned.archunit}',
    );
  });
});
