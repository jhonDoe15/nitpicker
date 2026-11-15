import {
  fieldOf,
  fieldsOf,
  listOf,
  textOf,
  textsOf,
} from '../../../../../../shared/values/readers.mts';
import type { ImportEdge, PythonModule } from '../../typed/python-graph-types.mts';

type FixtureEntry = {
  readonly name: string;
  readonly autouse: boolean;
  readonly requests: readonly string[];
};

type FileLiterals = {
  readonly fixtures: readonly FixtureEntry[];
  readonly plugins: readonly string[];
  readonly requests: readonly string[];
  readonly marks: readonly string[];
  readonly strings: readonly string[];
};

export type Literals = Readonly<Record<string, FileLiterals>>;

export type FixtureReach = {
  readonly files: string[];
  readonly unresolved: Set<string>;
  readonly marks: Set<string>;
};

export type GraphEdge = {
  readonly target: string;
  readonly kind: string;
  readonly dynamic?: true | undefined;
};

export type FileEdge = ImportEdge & { readonly dynamic?: true | undefined };

export type GraphEntry = PythonModule & { readonly production: boolean };

export type RuntimeGraph = {
  readonly fixtures: (test: string) => FixtureReach;
  readonly edges: Map<string, GraphEdge[]>;
};

export type RuntimeClassification = Readonly<Record<string, unknown>> & {
  readonly test: string;
  readonly category: string;
};

export type TestRuntimeReport = {
  readonly summary: Readonly<Record<string, unknown>> & { readonly discoveredTests: number };
  readonly exclusions: unknown;
  readonly tests: readonly RuntimeClassification[];
  readonly findings: readonly (RuntimeClassification & { readonly test: string })[];
};

function fixtureOf(entry: unknown): FixtureEntry {
  return {
    name: textOf(fieldOf(entry, 'name')),
    autouse: fieldOf(entry, 'autouse') === true,
    requests: textsOf(fieldOf(entry, 'requests')),
  };
}

export function literalsOf(value: unknown): Literals {
  return Object.fromEntries(
    Object.entries(fieldsOf(value)).map(([file, found]) => [
      file,
      {
        fixtures: listOf(fieldOf(found, 'fixtures')).map(fixtureOf),
        plugins: textsOf(fieldOf(found, 'plugins')),
        requests: textsOf(fieldOf(found, 'requests')),
        marks: textsOf(fieldOf(found, 'marks')),
        strings: textsOf(fieldOf(found, 'strings')),
      },
    ]),
  );
}
