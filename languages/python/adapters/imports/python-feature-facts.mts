import { featureFactAnalysis } from '../../../../shared/rules/facts/evaluate.mjs';
import { PUBLIC_FACES } from '../../../../shared/rules/features/feature-roles.mjs';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { statementTargets as untypedTargets, WHOLE_MODULE } from '../analysis/python-coupling.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import type { FeatureView } from './typed/import-rule-types.mts';
import type {
  ImportsByFile,
  ImportStatement,
  PythonModule,
} from '../analysis/typed/python-graph-types.mts';

type FeatureAnalysis = FeatureView & { readonly findings: IngestedFinding[] };
type Target = { readonly target: string | undefined; readonly name: string };
type NamedImport = { readonly name: string };
type FactOptions = {
  readonly isGenerated?: ((file: string) => boolean) | undefined;
  readonly persistence?: ReadonlyMap<string, unknown> | undefined;
};
type FeatureOptions = FactOptions & {
  readonly policy?: Readonly<Record<string, unknown>> | undefined;
};
type FactsReport = {
  readonly modules: readonly PythonModule[];
  readonly imports: ImportsByFile;
};

const statementTargets: (
  importer: PythonModule,
  statement: ImportStatement,
  known: ReadonlySet<string>,
) => Target[] = untypedTargets;

const COUPLING_TOOL = 'coupling';
export const FEATURE_RULES = [
  RULE_IDS.sharedUsedByOneFeature,
  RULE_IDS.featureInternalImport,
  RULE_IDS.sharedImportsFeature,
  RULE_IDS.featureCycle,
  RULE_IDS.foreignFeaturePersistence,
];

function isPublicName(name: string): boolean {
  return name === WHOLE_MODULE || !name.startsWith('_');
}

function namesByTarget(
  importer: PythonModule,
  statement: ImportStatement,
  known: ReadonlySet<string>,
): Map<string, NamedImport[]> {
  const byTarget = new Map<string, NamedImport[]>();
  for (const { target, name } of statementTargets(importer, statement, known)) {
    if (target !== undefined && target !== importer.module) {
      byTarget.set(target, [...(byTarget.get(target) ?? []), { name }]);
    }
  }
  return byTarget;
}

function isReexport(
  importer: PythonModule,
  statement: ImportStatement,
  names: readonly NamedImport[],
): boolean {
  return (
    importer.isPackage &&
    (statement.exported === true ||
      (statement.typeOnly !== true && names.some(({ name }) => isPublicName(name))))
  );
}

type StatementEdge = {
  readonly from: string;
  readonly to: string | undefined;
  readonly names: NamedImport[];
  readonly reexport: boolean;
  readonly typeOnly: boolean;
};
type ModuleFact = {
  readonly file: string;
  readonly role: string;
  readonly persistence?: unknown;
  readonly generated: boolean;
  readonly initializer: boolean;
};

function statementEdges(
  importer: PythonModule,
  statement: ImportStatement,
  { known, fileOf }: { known: ReadonlySet<string>; fileOf: ReadonlyMap<string, string> },
): StatementEdge[] {
  return [...namesByTarget(importer, statement, known)].map(([target, names]) => ({
    from: importer.file,
    to: fileOf.get(target),
    names,
    reexport: isReexport(importer, statement, names),
    typeOnly: statement.typeOnly === true,
  }));
}

function moduleFact(file: string, persistence: ReadonlyMap<string, unknown>) {
  return persistence.has(file)
    ? { file, role: 'production', persistence: persistence.get(file) }
    : { file, role: 'production' };
}

export function pythonImportFacts(
  { modules, imports }: FactsReport,
  { isGenerated = () => false, persistence = new Map() }: FactOptions = {},
): { modules: ModuleFact[]; imports: StatementEdge[] } {
  const known = new Set(modules.map(({ module }) => module));
  const fileOf = new Map(modules.map(({ module, file }) => [module, file]));
  return {
    modules: modules.map(({ file, isPackage }) => ({
      ...moduleFact(file, persistence),
      generated: isGenerated(file),
      initializer: isPackage,
    })),
    imports: modules.flatMap((importer) =>
      (imports[importer.file] ?? []).flatMap((statement) =>
        statementEdges(importer, statement, { known, fileOf }),
      ),
    ),
  };
}

export function pythonFeatureAnalysis(
  report: FactsReport,
  { policy = {}, isGenerated, persistence }: FeatureOptions = {},
): FeatureAnalysis {
  return featureFactAnalysis(pythonImportFacts(report, { isGenerated, persistence }), {
    language: 'python',
    analyzerName: COUPLING_TOOL,
    rules: FEATURE_RULES,
    policy: { exceptions: policy['exceptions'] ?? [], layout: policy['layout'] ?? {} },
    publicFace: PUBLIC_FACES.python,
  });
}
