import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readFileEntries } from './python-project.mjs';
import { toml } from '../../libraries/project-files.mjs';
import { parseIni } from '../configuration/ini-parser.mjs';

export const DJANGO_SCRIPT = 'manage.py';
const SETTINGS_ASSIGNMENT = /DJANGO_SETTINGS_MODULE["']\s*(?:,|\]\s*=)\s*["']([\w.]+)["']/;
const SETTINGS_KEY = 'DJANGO_SETTINGS_MODULE';
const PYTEST_INI_SECTIONS = {
  'pytest.ini': 'pytest',
  'setup.cfg': 'tool:pytest',
  'tox.ini': 'pytest',
};

function scriptIn(root, directory) {
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

export function readDjangoScript(projectRoot) {
  const root = path.resolve(projectRoot);
  const directories = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
  return ['', ...directories]
    .map((directory) => scriptIn(root, directory))
    .find((found) => found !== undefined);
}

export function djangoSettingsModule(projectRoot) {
  const code = (readDjangoScript(projectRoot)?.text ?? '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  return SETTINGS_ASSIGNMENT.exec(code)?.[1];
}

function namesSettings([name, text]) {
  if (name === 'pyproject.toml') {
    return toml().parse(text).tool?.pytest?.ini_options?.[SETTINGS_KEY] !== undefined;
  }
  return parseIni(text).get(PYTEST_INI_SECTIONS[name])?.has(SETTINGS_KEY) === true;
}

export function pytestNamesDjangoSettings(projectRoot) {
  return readFileEntries(projectRoot, [...Object.keys(PYTEST_INI_SECTIONS), 'pyproject.toml']).some(
    namesSettings,
  );
}

export function djangoSubdirectory(projectRoot) {
  const script = readDjangoScript(projectRoot)?.script;
  return script?.includes('/') ? path.posix.dirname(script) : undefined;
}
