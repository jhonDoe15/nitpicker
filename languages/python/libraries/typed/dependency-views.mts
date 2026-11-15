import { readPythonDependencies as untypedRead } from '../python-dependencies.mjs';

type DeclaredEntry = { name: string; normalized: string; group: string; file: string };

export type DeclaredDependencies = {
  dependencies: DeclaredEntry[];
  runtime: string[];
  development: string[];
  complete: boolean;
  declaresDev: boolean;
  manifest: string | undefined;
};

export const readPythonDependencies: (projectRoot: string) => DeclaredDependencies = untypedRead;
