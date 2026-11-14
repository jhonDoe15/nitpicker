import path from 'node:path';

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures');

export const JAVA_EFFECTS_FIXTURE = path.join(FIXTURES, 'effects-project');
export const KOTLIN_EFFECTS_FIXTURE = path.join(FIXTURES, 'effects-kotlin-project');

export const JAVA_EFFECTS = [
  'IoCallInLoop 26 LoopImports.eachInLoop loop OrderLoader.load()>OrderRepository.findById()',
  'IoCallInLoop 32 LoopImports.eachInCallback loop OrderLoader.load()>OrderRepository.findById()',
  'IoCallInLoop 36 LoopImports.pricesByReference loop PriceSource.priceOf()>RestClient.get()',
  'IoCallInLoop 40 LoopImports.inParallel concurrent OrderLoader.load()>OrderRepository.findById()',
  'IoCallInLoop 46 LoopImports.perElementFutures concurrent OrderLoader.load()>OrderRepository.findById()',
  'IoCallInLoop 53 LoopImports.directCall loop OrderRepository.findById()',
  'IoCallInLoop 59 LoopImports.savedFromHelper loop OrderLoader.load()>OrderRepository.findById()',
  'IoCallInLoop 59 LoopImports.savedFromHelper loop OrderRepository.save()',
  'IoCallInLoop 67 LoopImports.chainedLookup loop OrderRepository.findById()',
  'AccumulatorCopyInLoop 16 Accumulators.concatenated loop all',
  'AccumulatorCopyInLoop 23 Accumulators.reduced reduce acc',
  'AccumulatorCopyInLoop 32 Accumulators.copiedMap loop byId',
];

export const JAVA_LOOP_LINES = {
  loops: 'src/main/java/shop/reports/LoopImports.java',
  allowed: 'src/main/java/shop/reports/AllowedImports.java',
  pmd: [53, 59, 66],
  effects: [26, 32, 36, 40, 46],
};

export function loopLines(findings, tool, file) {
  return findings
    .filter(
      (finding) =>
        finding.tool === tool && finding.path === file && finding.rule.endsWith('InLoop'),
    )
    .map((finding) => finding.location.line);
}

export const JAVA_BATCHED_EFFECTS = JAVA_EFFECTS.filter(
  (entry) => !entry.startsWith('LazyRelationInLoop'),
);

export const KOTLIN_EFFECTS = [
  'IoCallInLoop 16 JavaImports.saveEach loop OrderRepository.save()',
  'IoCallInLoop 14 LoopImports.direct loop OrderRepository.deleteById()',
  'IoCallInLoop 18 LoopImports.inlined loop CrudRepository.findByIdOrNull()',
  'IoCallInLoop 21 LoopImports.throughHelper loop OrderLoader.load()>CrudRepository.findByIdOrNull()',
  'IoCallInLoop 24 LoopImports.remote loop OrderLoader.price()>RestClient.get()',
  'IoCallInLoop 27 LoopImports.concurrent concurrent OrderLoader.load()>CrudRepository.findByIdOrNull()',
  'AccumulatorCopyInLoop 6 Accumulators.folded loop acc',
  'AccumulatorCopyInLoop 11 Accumulators.reassigned loop ids',
  'AccumulatorCopyInLoop 18 Accumulators.mapped loop byId',
];

function summaryOf(violation) {
  const {
    rule,
    line,
    method,
    form,
    path: calls,
    variable,
    origin,
    entity,
    relation,
    scope,
  } = violation;
  if (scope !== undefined) {
    return [rule, line, method, scope, calls.join('>')].join(' ');
  }
  if (origin !== undefined) {
    return [rule, line, method, origin, `${entity}.${relation}`].join(' ');
  }
  return [rule, line, method, form, calls === undefined ? variable : calls.join('>')].join(' ');
}

export function effectsSummary({ violations }) {
  return violations.map(summaryOf);
}
