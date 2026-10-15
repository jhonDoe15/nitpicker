import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CHECKSTYLE_CONFIG_DIRECTORY,
  CLASSPATH_DIRECTORY,
  toolFiles,
  toolSetKey,
} from './tool-set.mjs';

const READY_MARKER = 'ready';
const CACHE_DIRECTORY = 'nitpicker-maven-tools';

function classpathOf(directory, name) {
  const file = path.join(directory, CLASSPATH_DIRECTORY, `${name}.txt`);
  return readFileSync(file, 'utf8')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isUsable(directory, names) {
  if (!existsSync(path.join(directory, READY_MARKER))) {
    return false;
  }
  return names.every((name) => classpathOf(directory, name).every((entry) => existsSync(entry)));
}

function describeSet(directory, names) {
  return {
    directory,
    classpath(name) {
      if (!names.includes(name)) {
        throw new Error(`Tool ${name} was not resolved`);
      }
      return classpathOf(directory, name);
    },
    checkstyleConfig: path.join(directory, CHECKSTYLE_CONFIG_DIRECTORY, 'google_checks.xml'),
  };
}

function populate(staging, files, runMaven) {
  for (const [name, text] of files) {
    mkdirSync(path.dirname(path.join(staging, name)), { recursive: true });
    writeFileSync(path.join(staging, name), text);
  }
  runMaven(['-f', path.join(staging, 'pom.xml'), `-Dnitpicker.out=${staging}`, 'validate']);
  writeFileSync(path.join(staging, READY_MARKER), '');
}

export function resolveToolSet({
  dependencies,
  versions,
  runMaven,
  cacheRoot = path.join(tmpdir(), CACHE_DIRECTORY),
}) {
  const files = toolFiles(dependencies, versions);
  const names = Object.keys(dependencies);
  const directory = path.join(cacheRoot, toolSetKey(files));
  if (isUsable(directory, names)) {
    return describeSet(directory, names);
  }
  mkdirSync(cacheRoot, { recursive: true });
  const staging = mkdtempSync(path.join(cacheRoot, 'staging-'));
  try {
    populate(staging, files, runMaven);
    rmSync(directory, { recursive: true, force: true });
    renameSync(staging, directory);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (!isUsable(directory, names)) {
      throw error;
    }
  }
  return describeSet(directory, names);
}
