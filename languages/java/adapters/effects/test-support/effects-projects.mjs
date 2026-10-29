import path from 'node:path';

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures');

export const JAVA_EFFECTS_FIXTURE = path.join(FIXTURES, 'effects-project');
export const KOTLIN_EFFECTS_FIXTURE = path.join(FIXTURES, 'effects-kotlin-project');

const JAVA_REMOTE = 'PriceSource.priceOf()>RestClient.get()';
const KOTLIN_REMOTE = 'OrderLoader.price()>RestClient.get()';
const JAVA_SEND = 'OrderEvents.placed()>KafkaTemplate.send()';
const KOTLIN_SEND = 'OrderLoader.placed()>KafkaTemplate.send()';
const PUBLISH = 'ApplicationEventPublisher.publishEvent()';

export const JAVA_EFFECTS = [
  'IoCallInLoop 33 DualAllowed.relay loop OrderRepository.delete()',
  'IoCallInLoop 26 LoopImports.eachInLoop loop OrderLoader.load()>OrderRepository.findById()',
  'IoCallInLoop 32 LoopImports.eachInCallback loop OrderLoader.load()>OrderRepository.findById()',
  'IoCallInLoop 36 LoopImports.pricesByReference loop PriceSource.priceOf()>RestClient.get()',
  'IoCallInLoop 40 LoopImports.inParallel concurrent OrderLoader.load()>OrderRepository.findById()',
  'IoCallInLoop 53 LoopImports.directCall loop OrderRepository.findById()',
  'IoCallInLoop 59 LoopImports.savedFromHelper loop OrderLoader.load()>OrderRepository.findById()',
  'IoCallInLoop 59 LoopImports.savedFromHelper loop OrderRepository.save()',
  'IoCallInLoop 67 LoopImports.chainedLookup loop OrderRepository.findById()',
  'AccumulatorCopyInLoop 16 Accumulators.concatenated loop all',
  'AccumulatorCopyInLoop 23 Accumulators.reduced reduce acc',
  'AccumulatorCopyInLoop 32 Accumulators.copiedMap loop byId',
  'LazyRelationInLoop 21 LazyLoads.customerNames InvoiceRepository.findAll() Invoice.customer',
  'LazyRelationInLoop 35 LazyLoads.linesFromQuery TypedQuery.getResultList() Invoice.lines',
  'LazyRelationInLoop 44 LazyLoads.namesNextToFetchedLines InvoiceRepository.findWithLines() Invoice.customer',
  'LazyRelationInLoop 27 LazyLoads.lineCounts InvoiceRepository.findFrom() Invoice.lines',
  `RemoteCallInTransaction 26 HeldScopes.confirm @Transactional ${JAVA_REMOTE}`,
  `RemoteCallInTransaction 32 HeldScopes.inTemplate TransactionTemplate.executeWithoutResult() ${JAVA_REMOTE}`,
  `RemoteCallUnderLock 37 HeldScopes.refresh synchronized ${JAVA_REMOTE}`,
  `RemoteCallUnderLock 43 HeldScopes.underLock ReentrantLock.lock() ${JAVA_REMOTE}`,
  `RemoteCallUnderLock 51 HeldScopes.inBlock synchronized ${JAVA_REMOTE}`,
  `RemoteCallUnderLock 61 HeldScopes.guardedUnderLock ReentrantLock.lock() ${JAVA_REMOTE}`,
  `RemoteCallUnderLock 73 HeldScopes.guardedBlock synchronized ${JAVA_REMOTE}`,
  `RetryWithoutIdempotency 25 Retries.announce @Retryable ${JAVA_SEND}`,
  'RetryWithoutIdempotency 31 Retries.record retry loop JdbcTemplate.update()',
  'RetryWithoutIdempotency 42 Retries.charge RetryTemplate.execute() Charge.create()',
  `DualWriteWithoutOutbox 23 DualWrites.place inline ${JAVA_SEND}`,
  `DualWriteWithoutOutbox 28 DualWrites.placeWithEvent afterCommit ${PUBLISH}>OrderListeners.onPlaced()>${JAVA_SEND}`,
  `DualWriteWithoutOutbox 33 DualWrites.ship inline ${PUBLISH}>OrderListeners.onShipped()>${JAVA_SEND}`,
  `DualWriteWithoutOutbox 41 DualWrites.placeAfterCommit afterCommit ${JAVA_SEND}`,
];

export const JAVA_LOOP_LINES = {
  loops: 'src/main/java/shop/reports/LoopImports.java',
  allowed: 'src/main/java/shop/reports/AllowedImports.java',
  pmd: [53, 59, 66],
  effects: [26, 32, 36, 40],
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
  'LazyRelationInLoop 4 LazyLoads.customerNames InvoiceRepository.findAll() Invoice.customer',
  'LazyRelationInLoop 9 LazyLoads.lineCount InvoiceRepository.findFrom() Invoice.lines',
  'LazyRelationInLoop 14 LazyLoads.lazySequence InvoiceRepository.findAll() Invoice.lines',
  `RemoteCallInTransaction 25 HeldScopes.confirm @Transactional ${KOTLIN_REMOTE}`,
  `RemoteCallInTransaction 30 HeldScopes.inTemplate TransactionTemplate.execute() ${KOTLIN_REMOTE}`,
  `RemoteCallUnderLock 33 HeldScopes.underLock Lock.lock() ${KOTLIN_REMOTE}`,
  `RemoteCallUnderLock 35 HeldScopes.underMutex Mutex.lock() ${KOTLIN_REMOTE}`,
  `RemoteCallUnderLock 39 HeldScopes.guardedUnderLock Lock.lock() ${KOTLIN_REMOTE}`,
  `RemoteCallUnderLock 45 HeldScopes.guardedBlock synchronized ${KOTLIN_REMOTE}`,
  `RemoteCallUnderLock 50 HeldScopes.guardedMutex Mutex.lock() ${KOTLIN_REMOTE}`,
  `RetryWithoutIdempotency 9 Retries.announce @Retryable ${KOTLIN_SEND}`,
  `RetryWithoutIdempotency 14 Retries.announceWithLoop retry loop ${KOTLIN_SEND}`,
  `DualWriteWithoutOutbox 15 DualWrites.place inline ${KOTLIN_SEND}`,
  `DualWriteWithoutOutbox 20 DualWrites.placeWithEvent afterCommit ${PUBLISH}>OrderListeners.onPlaced()>${KOTLIN_SEND}`,
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
