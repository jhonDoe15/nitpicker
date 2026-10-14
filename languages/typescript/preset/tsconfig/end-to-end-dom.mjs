import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { END_TO_END_ROOT } from '../layout.mjs';

const DOM_LIB = 'dom';
const LIB_FILE = /^lib\.(.+)\.d\.ts$/u;

function hasEndToEndFolder(projectDirectory, layout) {
  return (
    layout.testRoots.includes(END_TO_END_ROOT) &&
    existsSync(path.join(projectDirectory, END_TO_END_ROOT))
  );
}

export function projectLibs(projectDirectory, configName) {
  const typescript = createRequire(import.meta.url)('typescript');
  const file = path.join(projectDirectory, configName);
  const { config } = typescript.readConfigFile(file, typescript.sys.readFile);
  const { options } = typescript.parseJsonConfigFileContent(
    config,
    typescript.sys,
    path.dirname(file),
  );
  return options.lib?.map((lib) => path.basename(lib).replace(LIB_FILE, '$1'));
}

export function libsWithEndToEndDom(libs, projectDirectory, layout) {
  const needsDom =
    libs !== undefined &&
    hasEndToEndFolder(projectDirectory, layout) &&
    !libs.some((lib) => lib.toLowerCase() === DOM_LIB);
  return needsDom ? [...libs, DOM_LIB] : undefined;
}
