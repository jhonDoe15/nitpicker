import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readFileEntries } from './python-project.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { parseToml } from '../configuration/project-files.mts';
import type { DjangoScript, FileEntry } from './typed/project-types.mts';
import { parseIni } from '../configuration/ini-parser.mts';

const PYTEST = 'pytest';
export const DJANGO_SCRIPT = 'manage.py';
const SETTINGS_ASSIGNMENT = /DJANGO_SETTINGS_MODULE["']\s*(?:,|\]\s*=)\s*["']([\w.]+)["']/;
const SETTINGS_KEY = 'DJANGO_SETTINGS_MODULE';
const PYTEST_INI_SECTIONS: Readonly<Record<string, string>> = {
  'pytest.ini': PYTEST,
  'setup.cfg': 'tool:pytest',
  'tox.ini': PYTEST,
};

function scriptIn(root: string, directory: string): DjangoScript | undefined {
  const script = path.resolve(root, directory, DJANGO_SCRIPT);
  if (!script.startsWith(root + path.sep)) {
    return undefined;
  }
  if (!existsSync(script)) {
    return undefined;
  }
  return {
    script: path.relative(root, script).split(path.sep).join('/'),
    directory: path.dirname(script),
    text: readFileSync(script, 'utf8'),
  };
}

export function readDjangoScript(projectRoot: string): DjangoScript | undefined {
  const root = path.resolve(projectRoot);
  const directories = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
  return ['', ...directories]
    .map((directory) => scriptIn(root, directory))
    .find((found) => found !== undefined);
}

export function djangoSettingsModule(projectRoot: string): string | undefined {
  const code = (readDjangoScript(projectRoot)?.text ?? '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  return SETTINGS_ASSIGNMENT.exec(code)?.[1];
}

function namesSettings([name, text]: FileEntry): boolean {
  if (name === 'pyproject.toml') {
    const parsed = parseToml(text);
    const options = fieldOf(
      fieldOf(fieldOf(parsed.kind === 'table' ? parsed.table : {}, 'tool'), PYTEST),
      'ini_options',
    );
    return fieldOf(options, SETTINGS_KEY) !== undefined;
  }
  return (
    parseIni(text)
      .get(PYTEST_INI_SECTIONS[name] ?? '')
      ?.has(SETTINGS_KEY) === true
  );
}

export function pytestNamesDjangoSettings(projectRoot: string): boolean {
  return readFileEntries(projectRoot, [...Object.keys(PYTEST_INI_SECTIONS), 'pyproject.toml']).some(
    namesSettings,
  );
}

export function djangoSubdirectory(projectRoot: string): string | undefined {
  const script = readDjangoScript(projectRoot)?.script;
  return script?.includes('/') ? path.posix.dirname(script) : undefined;
}
