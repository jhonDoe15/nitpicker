import path from 'node:path';
import { lazyTypeScriptApi } from '../../typescript-api/lazy-typescript-api.mjs';

function projectOptions(projectRoot, javascript) {
  const ts = lazyTypeScriptApi();
  const configPath =
    ts.findConfigFile(projectRoot, ts.sys.fileExists) ??
    ts.findConfigFile(projectRoot, ts.sys.fileExists, 'jsconfig.json');
  const base = { allowJs: true, checkJs: javascript, noEmit: true };
  if (configPath === undefined) {
    return { options: base, fileNames: [] };
  }
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    read.config ?? {},
    ts.sys,
    path.dirname(configPath),
    base,
    configPath,
  );
  return {
    options: { ...parsed.options, ...base, checkJs: javascript || parsed.options.checkJs === true },
    fileNames: parsed.fileNames,
  };
}

export function createFixService({ projectRoot, javascript, names }) {
  const ts = lazyTypeScriptApi();
  const { options, fileNames } = projectOptions(projectRoot, javascript);
  function absolute(name) {
    return path.resolve(projectRoot, name);
  }
  const roots = new Set([...fileNames, ...names.map(absolute)]);
  const texts = new Map();
  const versions = new Map();
  const host = {
    getScriptFileNames: () => [...roots],
    getScriptVersion: (file) => String(versions.get(file) ?? 0),
    getScriptSnapshot: (file) => {
      const text = texts.get(file) ?? ts.sys.readFile(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  return {
    service,
    absolute,
    setText(name, text) {
      const file = absolute(name);
      texts.set(file, text);
      versions.set(file, (versions.get(file) ?? 0) + 1);
    },
    dispose: () => service.dispose(),
  };
}
