import path from 'node:path';
import type TypeScript from 'typescript';
import { lazyTypeScriptApi } from '../typed/lazy-typescript-api.mts';

function projectOptions(
  projectRoot: string,
  javascript: boolean,
): { options: TypeScript.CompilerOptions; fileNames: readonly string[] } {
  const ts = lazyTypeScriptApi();
  const configPath =
    ts.findConfigFile(projectRoot, (file) => ts.sys.fileExists(file)) ??
    ts.findConfigFile(projectRoot, (file) => ts.sys.fileExists(file), 'jsconfig.json');
  const base = { allowJs: true, checkJs: javascript, noEmit: true };
  if (configPath === undefined) {
    return { options: base, fileNames: [] };
  }
  const read = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
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

export type FixService = {
  readonly service: TypeScript.LanguageService;
  readonly host: TypeScript.LanguageServiceHost;
  readonly absolute: (name: string) => string;
  readonly setText: (name: string, text: string | undefined) => void;
  readonly dispose: () => void;
};

type TextOverlay = {
  readonly textOf: (file: string) => string | undefined;
  readonly versionOf: (file: string) => string;
  readonly hasDirectory: (directory: string) => boolean;
  readonly setText: (file: string, text: string | undefined) => void;
  readonly clear: () => void;
};

function textOverlay(): TextOverlay {
  const ts = lazyTypeScriptApi();
  const texts = new Map<string, string | undefined>();
  const versions = new Map<string, number>();
  function textOf(file: string): string | undefined {
    return texts.has(file) ? texts.get(file) : ts.sys.readFile(file);
  }
  function insideKnownFile(directory: string): boolean {
    return [...texts].some(
      ([file, text]) => text !== undefined && file.startsWith(`${directory}/`),
    );
  }
  return {
    textOf,
    versionOf: (file) => String(versions.get(file) ?? 0),
    hasDirectory: (directory) => ts.sys.directoryExists(directory) || insideKnownFile(directory),
    setText(file, text) {
      texts.set(file, text);
      versions.set(file, (versions.get(file) ?? 0) + 1);
    },
    clear() {
      texts.clear();
      versions.clear();
    },
  };
}

function serviceHost(
  {
    projectRoot,
    options,
    roots,
  }: {
    readonly projectRoot: string;
    readonly options: TypeScript.CompilerOptions;
    readonly roots: ReadonlySet<string>;
  },
  overlay: TextOverlay,
): TypeScript.LanguageServiceHost {
  const ts = lazyTypeScriptApi();
  const { textOf } = overlay;
  return {
    getScriptFileNames: () => [...roots].filter((file) => textOf(file) !== undefined),
    getScriptVersion: overlay.versionOf,
    getScriptSnapshot: (file: string) => {
      const text = textOf(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (settings: TypeScript.CompilerOptions) =>
      ts.getDefaultLibFilePath(settings),
    fileExists: (file: string) => textOf(file) !== undefined,
    readFile: textOf,
    readDirectory: (...request) => ts.sys.readDirectory(...request),
    directoryExists: overlay.hasDirectory,
    getDirectories: (directory) => ts.sys.getDirectories(directory),
  };
}

export function createFixService({
  projectRoot,
  javascript,
  names,
}: {
  readonly projectRoot: string;
  readonly javascript: boolean;
  readonly names: readonly string[];
}): FixService {
  const ts = lazyTypeScriptApi();
  const { options, fileNames } = projectOptions(projectRoot, javascript);
  function absolute(name: string): string {
    return path.resolve(projectRoot, name);
  }
  const roots = new Set([...fileNames, ...names.map(absolute)]);
  const overlay = textOverlay();
  const host = serviceHost({ projectRoot, options, roots }, overlay);
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  return {
    service,
    host,
    absolute,
    setText(name: string, text: string | undefined): void {
      overlay.setText(absolute(name), text);
    },
    dispose(): void {
      overlay.clear();
      service.dispose();
    },
  };
}
