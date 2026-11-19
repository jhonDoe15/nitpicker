import type { Annotation, LocalFact, Read, ScopeFact } from './spring-facts.mts';
import type { Grouping } from '../../kotlin-facts.mts';

export type Direct = { direct: true; type?: undefined };
type Shaped = { type: string; direct?: undefined };
export type Taint = Direct | Shaped;
export type Mode = 'alias' | 'element';

export type Place = { line: number; holder?: LocalFact | undefined; via?: string | undefined };
export type Where = { chain: ScopeFact[]; line: number; holder?: LocalFact | undefined };

export type NameEntry = {
  key: string;
  type?: string | undefined;
  origin?: LocalFact['origin'];
  local?: LocalFact;
};
export type Names = Grouping<string, NameEntry>;
export type Resolution = { node: string; member?: string | undefined; implicit?: true };

export type BindingIndex = {
  names: Map<number, Names>;
  functionScopes: Map<string, ScopeFact>;
  resolve: (read: Read, scopeId: number | undefined, place: Place) => Resolution | undefined;
  declaration: (scopeId: number | undefined, name: string, place: Place) => NameEntry | undefined;
  functionScope: (fn: { name: string; line: number }) => ScopeFact | undefined;
  localKey: (local: LocalFact) => string;
};

export type Found = {
  node: string;
  member: string | undefined;
  implicit: true | undefined;
  read: Read;
};

export type Holder = {
  target: string;
  mode: Mode | undefined;
  type?: string | undefined;
  reads: Found[];
};

export type Edge = {
  target: string;
  reads: Read[];
  kind?: Taint | undefined;
  via?: string | undefined;
  scope: number;
  line: number;
};

export type RequestFlow = {
  taintedRead: (read: Read, scope: number, place: Place) => boolean;
  tainted: (reads: Read[] | undefined, scope: number, place: Place) => boolean;
};

export type SeedParameter = {
  name: string;
  type?: string | undefined;
  annotationEntries?: Annotation[] | undefined;
};
export type Seed = { key: string; kind: Taint };
