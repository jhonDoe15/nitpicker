import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { featureCycleEdges } from '../../../../shared/rules/features/feature-cycles.mjs';
import {
  featureRoleContract,
  PUBLIC_FACES,
} from '../../../../shared/rules/features/feature-roles.mjs';
import { statementTargets } from '../analysis/python-coupling.mjs';

const COUPLING_TOOL = 'coupling';
const WHOLE_MODULE = '*';

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

function statementEdges(importer, statement, { known, fileOf }) {
  return [...namesByTarget(importer, statement, known)].map(([target, names]) => ({
    from: importer.file,
    to: fileOf.get(target),
    names,
    reexport: importer.isPackage && names.some(({ name }) => isPublicName(name)),
    typeOnly: statement.typeOnly === true,
  }));
}

export function pythonImportFacts({ modules, imports }, isGenerated = () => false) {
  const known = new Set(modules.map(({ module }) => module));
  const fileOf = new Map(modules.map(({ module, file }) => [module, file]));
  return {
    modules: modules.map(({ file }) => ({ file, role: 'production' })),
    imports: modules
      .filter(({ file }) => !isGenerated(file))
      .flatMap((importer) =>
        (imports[importer.file] ?? []).flatMap((statement) =>
          statementEdges(importer, statement, { known, fileOf }),
        ),
      ),
  };
}

export function pythonFeatureAnalysis(report, { policy = {}, isGenerated } = {}) {
  const facts = pythonImportFacts(report, isGenerated);
  const featurePolicy = { exceptions: policy.exceptions ?? [], layout: policy.layout ?? {} };
  const roleOf = featureRoleContract(featurePolicy.layout, PUBLIC_FACES.python);
  return {
    findings: sharedFactFindings(facts, {
      language: 'python',
      analyzerName: COUPLING_TOOL,
      policy: featurePolicy,
      publicFace: PUBLIC_FACES.python,
    }),
    cycleEdges: new Set(featureCycleEdges(facts, roleOf).map(({ from, to }) => `${from}\0${to}`)),
  };
}
