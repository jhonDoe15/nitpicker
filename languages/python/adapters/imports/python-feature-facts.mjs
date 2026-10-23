import { featureFactAnalysis } from '../../../../shared/rules/facts/evaluate.mjs';
import { PUBLIC_FACES } from '../../../../shared/rules/features/feature-roles.mjs';
import { statementTargets, WHOLE_MODULE } from '../analysis/python-coupling.mjs';

const COUPLING_TOOL = 'coupling';

function isPublicName(name) {
  return name === WHOLE_MODULE || !name.startsWith('_');
}

function namesByTarget(importer, statement, known) {
  const byTarget = new Map();
  for (const { target, name } of statementTargets(importer, statement, known)) {
    if (target !== undefined && target !== importer.module) {
      byTarget.set(target, [...(byTarget.get(target) ?? []), { name }]);
    }
  }
  return byTarget;
}

function isReexport(importer, statement, names) {
  return (
    importer.isPackage &&
    (statement.exported === true ||
      (statement.typeOnly !== true && names.some(({ name }) => isPublicName(name))))
  );
}

function statementEdges(importer, statement, { known, fileOf }) {
  return [...namesByTarget(importer, statement, known)].map(([target, names]) => ({
    from: importer.file,
    to: fileOf.get(target),
    names,
    reexport: isReexport(importer, statement, names),
    typeOnly: statement.typeOnly === true,
  }));
}

function moduleFact(file, persistence) {
  return persistence.has(file)
    ? { file, role: 'production', persistence: persistence.get(file) }
    : { file, role: 'production' };
}

export function pythonImportFacts(
  { modules, imports },
  { isGenerated = () => false, persistence = new Map() } = {},
) {
  const known = new Set(modules.map(({ module }) => module));
  const fileOf = new Map(modules.map(({ module, file }) => [module, file]));
  return {
    modules: modules.map(({ file, isPackage }) => ({
      ...moduleFact(file, persistence),
      generated: isGenerated(file),
      initializer: isPackage === true,
    })),
    imports: modules.flatMap((importer) =>
      (imports[importer.file] ?? []).flatMap((statement) =>
        statementEdges(importer, statement, { known, fileOf }),
      ),
    ),
  };
}

export function pythonFeatureAnalysis(report, { policy = {}, isGenerated, persistence } = {}) {
  return featureFactAnalysis(pythonImportFacts(report, { isGenerated, persistence }), {
    language: 'python',
    analyzerName: COUPLING_TOOL,
    policy: { exceptions: policy.exceptions ?? [], layout: policy.layout ?? {} },
    publicFace: PUBLIC_FACES.python,
  });
}
