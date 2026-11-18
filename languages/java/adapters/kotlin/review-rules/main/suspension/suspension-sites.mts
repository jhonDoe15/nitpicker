import type { ClassFact, FunctionFact, KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { ClassScope } from '../locking/locking-types.mts';
import type { UpdateFact } from './suspension-types.mts';

export type DeclaredFunction = FunctionFact & { package: string };

export type SuspensionView = {
  functions: DeclaredFunction[];
  classes: ClassFact[];
  members: (owner: string, name: string) => DeclaredFunction[];
  named: (name: string) => DeclaredFunction[];
  classNamed: (name: string | undefined) => ClassFact | undefined;
};

export type SuspensionSite = {
  file: KotlinFile;
  view: SuspensionView;
  klass: ClassScope | undefined;
};

export type SavedValue = { reads: Set<string>; call: string | undefined; underLock: boolean };
export type SourceValue = { reads: string[]; call: string | undefined };
export type SaveState = {
  update: UpdateFact;
  site: SuspensionSite;
  saved: Map<string, SavedValue>;
  locked: boolean;
};
