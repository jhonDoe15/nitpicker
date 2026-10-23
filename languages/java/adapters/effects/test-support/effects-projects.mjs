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
  'IoCallInLoop 59 LoopImports.savedFromHelper loop OrderLoader.load()>OrderRepository.findById()',
  'AccumulatorCopyInLoop 15 Accumulators.concatenated loop all',
  'AccumulatorCopyInLoop 22 Accumulators.reduced reduce acc',
  'AccumulatorCopyInLoop 31 Accumulators.copiedMap loop byId',
  'LazyRelationInLoop 21 LazyLoads.customerNames InvoiceRepository.findAll() Invoice.customer',
  'LazyRelationInLoop 35 LazyLoads.linesFromQuery TypedQuery.getResultList() Invoice.lines',
  'LazyRelationInLoop 44 LazyLoads.namesNextToFetchedLines InvoiceRepository.findWithLines() Invoice.customer',
  'LazyRelationInLoop 27 LazyLoads.lineCounts InvoiceRepository.findFrom() Invoice.lines',
];

export const JAVA_BATCHED_EFFECTS = JAVA_EFFECTS.filter(
  (entry) => !entry.startsWith('LazyRelationInLoop'),
);

export const KOTLIN_EFFECTS = [
  'IoCallInLoop 14 LoopImports.direct loop OrderRepository.deleteById()',
  'IoCallInLoop 18 LoopImports.inlined loop CrudRepository.findByIdOrNull()',
  'IoCallInLoop 21 LoopImports.throughHelper loop OrderLoader.load()>CrudRepository.findByIdOrNull()',
  'IoCallInLoop 24 LoopImports.remote loop OrderLoader.price()>RestClient.get()',
  'IoCallInLoop 27 LoopImports.concurrent concurrent OrderLoader.load()>CrudRepository.findByIdOrNull()',
  'AccumulatorCopyInLoop 6 Accumulators.folded loop acc',
  'AccumulatorCopyInLoop 11 Accumulators.reassigned loop ids',
  'AccumulatorCopyInLoop 18 Accumulators.mapped loop byId',
  'LazyRelationInLoop 4 LazyLoads.customerNames InvoiceRepository.findAll() Invoice.customer',
  'LazyRelationInLoop 9 LazyLoads.lineCount InvoiceRepository.findFrom() Invoice.lines',
  'LazyRelationInLoop 14 LazyLoads.lazySequence InvoiceRepository.findAll() Invoice.lines',
];

function summaryOf({ rule, line, method, form, path: calls, variable, origin, entity, relation }) {
  if (origin !== undefined) {
    return [rule, line, method, origin, `${entity}.${relation}`].join(' ');
  }
  return [rule, line, method, form, calls === undefined ? variable : calls.join('>')].join(' ');
}

export function effectsSummary({ violations }) {
  return violations.map(summaryOf);
}
