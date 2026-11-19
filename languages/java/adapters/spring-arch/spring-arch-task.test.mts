import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mts';
import { textOf } from '../../../../shared/values/readers.mts';

const script = readFileSync(INIT_SCRIPT, 'utf8');

function captured(pattern: RegExp, text: string, group = 1): string {
  return textOf(pattern.exec(text)?.[group]);
}

function taskBody(name: string): string {
  const start = script.indexOf(`tasks.register('${name}'`);
  return script.slice(start, script.indexOf('\n        }\n', start));
}

describe('nitpickerSpringArch in the init script', () => {
  it('runs as part of nitpickerJava', () => {
    const dependsOn = [
      ...taskBody('nitpickerJava').matchAll(/dependsOn ((?:'[^'\n]+',\s*)*'[^'\n]+')/gu),
    ].flatMap(([, names = '']) =>
      names.split(/,\s*/u).map((task: string) => task.replaceAll("'", '')),
    );

    expect(dependsOn).toEqual([
      'nitpickerPmd',
      'nitpickerSpotbugs',
      'nitpickerErrorProne',
      'nitpickerFormat',
      'nitpickerArchunit',
      'nitpickerSpringArch',
      'nitpickerStructure',
      'nitpickerJacoco',
      'nitpickerPit',
    ]);
  });

  it('runs for Spring or jMolecules projects and for projects with a feature folder, so other projects skip it', () => {
    expect(captured(/onlyIf \{[^}]*\}/, taskBody('nitpickerSpringArch'), 0)).toBe(
      'onlyIf { runsArchRules() }',
    );
    expect(captured(/def runsArchRules = (.+)/, script, 1)).toBe(
      '{ usesSpring() || usesJmolecules() || featureFoldersDeclared }',
    );
    expect(captured(/def featureFoldersDeclared = (.+)/, script, 1)).toBe(
      "nitpickerArgument('nitpicker.featureFolders') == 'true'",
    );
  });

  it('tells the reader through the manifest that the rules ran', () => {
    expect(captured(/springArch\s*: ([^,\n]+)/, taskBody('nitpickerJava'), 1)).toBe(
      'runsArchRules()',
    );
  });

  it('resolves the pinned ArchUnit version', () => {
    expect(captured(/archunit\s*: '([^']+)'/, script, 1)).toBe('1.5.1');
    expect(captured(/nitpickerSpringArch "([^"]+)"/, script, 1)).toBe(
      `com.tngtech.archunit:archunit:$\{pinned.archunit}`,
    );
  });
});
