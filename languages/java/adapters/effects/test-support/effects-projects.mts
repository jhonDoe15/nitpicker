import path from 'node:path';
import { fieldOf, textOf, textsOf } from '../../../../../shared/values/readers.mts';
import type { JavaFinding } from '../../typed/java-values.mts';

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures');

export const JAVA_EFFECTS_FIXTURE = path.join(FIXTURES, 'effects-project');
export const KOTLIN_EFFECTS_FIXTURE = path.join(FIXTURES, 'effects-kotlin-project');

const JAVA_REMOTE = 'PriceSource.priceOf()>RestClient.get()';
const KOTLIN_REMOTE = 'OrderLoader.price()>RestClient.get()';
const JAVA_SEND = 'OrderEvents.placed()>KafkaTemplate.send()';
const KOTLIN_SEND = 'OrderLoader.placed()>KafkaTemplate.send()';
const KOTLIN_LOAD = 'OrderLoader.load()>CrudRepository.findByIdOrNull()';
const PUBLISH = 'ApplicationEventPublisher.publishEvent()';
const EXISTS = 'MemberRepository.existsByEmail()';
const COUNT = 'MemberRepository.countByTeam()';
const BY_EMAIL = 'MemberRepository.findByEmail()';
const BY_ID = 'MemberRepository.findById()';
const SAVE = 'MemberRepository.save()';
const LOAD = 'OrderLoader.load()>OrderRepository.findById()';

export const JAVA_EFFECTS = [
  `CheckThenWriteWithoutLock 19 Registrations.register ${EXISTS} ${SAVE}`,
  `CheckThenWriteWithoutLock 27 Registrations.join ${COUNT} ${SAVE}`,
  `CheckThenWriteWithoutLock 31 Registrations.findOrCreate ${BY_EMAIL} ${SAVE}`,
  `CheckThenWriteWithoutLock 40 Registrations.rename ${BY_ID} ${SAVE}`,
  'IoCallInLoop 33 DualAllowed.relay loop OrderRepository.delete()',
  `IoCallInLoop 29 JobsAllowed.isolated loop ${LOAD}`,
  `IoCallInLoop 41 JobsAllowed.isolatedInCallback loop ${LOAD}`,
  `IoCallInLoop 59 JobsAllowed.oneTaskPerItem concurrent ${LOAD}`,
  `IoCallInLoop 67 JobsAllowed.isolatedByHelper loop SafeLoader.load()>${LOAD}`,
  `IoCallInLoop 87 JobsAllowed.notAJob loop ${LOAD}`,
  `IoCallInLoop 30 NightlyJobs.closeOrders loop ${LOAD}`,
  `IoCallInLoop 37 NightlyJobs.refreshPrices loop ${JAVA_REMOTE}`,
  `IoCallInLoop 43 NightlyJobs.reloadEach loop ${LOAD}`,
  'IoCallInLoop 53 NightlyJobs.sweep loop OrderRepository.deleteById()',
  `IoCallInLoop 61 NightlyJobs.rethrown loop ${LOAD}`,
  `IoCallInLoop 72 NightlyJobs.wholeLoop loop ${LOAD}`,
  'IoCallInLoop 82 NightlyJobs.onBatch loop OrderRepository.deleteById()',
  `IoCallInLoop 89 NightlyJobs.onMessages loop ${LOAD}`,
  `IoCallInLoop 96 NightlyJobs.execute loop ${LOAD}`,
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
  'GraphqlFieldPerParent 23 OrderFields.previous spring OrderRepository.findById()',
  'GraphqlFieldPerParent 28 OrderFields.viaHelper spring OrderLoader.load()>OrderRepository.findById()',
  `GraphqlFieldPerParent 33 OrderFields.price spring ${JAVA_REMOTE}`,
  'GraphqlFieldPerParent 38 OrderFields.dgsPrevious dgs OrderRepository.findById()',
  'LazyRelationInLoop 21 LazyLoads.customerNames InvoiceRepository.findAll() Invoice.customer',
  'LazyRelationInLoop 35 LazyLoads.linesFromQuery TypedQuery.getResultList() Invoice.lines',
  'LazyRelationInLoop 44 LazyLoads.namesNextToFetchedLines InvoiceRepository.findWithLines() Invoice.customer',
  'LazyRelationInLoop 27 LazyLoads.lineCounts InvoiceRepository.findFrom() Invoice.lines',
  'ReactiveLookupPerElement 16 OrderStreams.byReference ReactiveCrudRepository.findById()',
  'ReactiveLookupPerElement 20 OrderStreams.byLambda ReactiveOrders.findById()',
  'ReactiveLookupPerElement 24 OrderStreams.byHelper OrderStreams.lookup()>ReactiveOrders.findById()',
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
  'RowsChangedInMemory 14 TicketUpdates.expire update TicketRepository.findByStatus() Ticket',
  'RowsChangedInMemory 21 TicketUpdates.close update TicketRepository.findByStatus() Ticket',
  'RowsChangedInMemory 27 TicketUpdates.purge delete TicketRepository.findByStatus() Ticket',
  'EntityLoadedForOneColumn 13 MemberViews.emails MemberRepository.findByTeam() Member.getEmail',
  'EntityLoadedForExistence 17 MemberViews.taken count MemberRepository.countByEmail()',
  'EntityLoadedForExistence 21 MemberViews.known loaded MemberRepository.findByEmail()',
  'RetryWithStaleObject 21 OrderSaves.resend Reactor retry order ReactiveOrders.save()',
  'RetryWithStaleObject 25 OrderSaves.captured Reactor retry order ReactiveOrders.save()',
  'RetryWithStaleObject 31 OrderSaves.loop retry loop order OrderRepository.save()',
  'RetryWithStaleObject 41 OrderSaves.annotated @Retryable order OrderRepository.save()',
  'AsyncMethodDoesBlockingWork 20 OrderFutures.wrapped CompletableFuture.completedFuture() OrderRepository.findById()',
  'WaitOnAsyncTwin 32 OrderFutures.waits OrderFutures.findAsync()',
  `JobLoopWithoutItemIsolation 30 NightlyJobs.closeOrders @Scheduled ${LOAD}`,
  `JobLoopWithoutItemIsolation 37 NightlyJobs.refreshPrices @Scheduled ${JAVA_REMOTE}`,
  `JobLoopWithoutItemIsolation 43 NightlyJobs.reloadEach @Scheduled ${LOAD}`,
  'JobLoopWithoutItemIsolation 53 NightlyJobs.sweep @Scheduled OrderRepository.deleteById()',
  `JobLoopWithoutItemIsolation 61 NightlyJobs.rethrown @Scheduled ${LOAD}`,
  `JobLoopWithoutItemIsolation 72 NightlyJobs.wholeLoop @Scheduled ${LOAD}`,
  'JobLoopWithoutItemIsolation 82 NightlyJobs.onBatch @KafkaListener OrderRepository.deleteById()',
  `JobLoopWithoutItemIsolation 89 NightlyJobs.onMessages @SqsListener ${LOAD}`,
  `JobLoopWithoutItemIsolation 96 NightlyJobs.execute Quartz Job ${LOAD}`,
  'SoftDeleteFilterMissing 26 ProductService.ownedBy Product.deletedAt ProductRepository.findByOwner()',
  'SoftDeleteFilterMissing 30 ProductService.like Product.deletedAt ProductRepository.matching()',
  'SoftDeleteFilterMissing 35 ProductService.bySku Product.deletedAt EntityManager.createQuery()',
  'DeletedItemInMemory 85 BasketReports.count Item.deletedAt Basket.getItems()',
  'DeletedItemInMemory 92 BasketReports.quantities Item.deletedAt Basket.getItems()',
  'HandlerWithoutAuth 54 AccountController.export @PreAuthorize 10/11',
];

export const JAVA_LOOP_LINES = {
  loops: 'src/main/java/shop/reports/LoopImports.java',
  allowed: 'src/main/java/shop/reports/AllowedImports.java',
  pmd: [53, 59, 66],
  effects: [26, 32, 36, 40, 46],
};

export function loopLines(findings: readonly JavaFinding[], tool: string, file: string): number[] {
  return findings
    .filter(
      (finding) =>
        finding.tool === tool && finding.path === file && finding.rule.endsWith('InLoop'),
    )
    .flatMap((finding) => (finding.location?.line === undefined ? [] : [finding.location.line]));
}

export const JAVA_BATCHED_EFFECTS = JAVA_EFFECTS.filter(
  (entry) => !entry.startsWith('LazyRelationInLoop'),
);

export const KOTLIN_EFFECTS = [
  `CheckThenWriteWithoutLock 16 Registrations.register ${EXISTS} ${SAVE}`,
  `CheckThenWriteWithoutLock 24 Registrations.join ${COUNT} ${SAVE}`,
  `CheckThenWriteWithoutLock 28 Registrations.findOrCreate ${BY_EMAIL} ${SAVE}`,
  `CheckThenWriteWithoutLock 36 Registrations.rename CrudRepository.findByIdOrNull() ${SAVE}`,
  `IoCallInLoop 16 JobsAllowed.isolated loop ${KOTLIN_LOAD}`,
  `IoCallInLoop 26 JobsAllowed.isolatedByRunCatching loop ${KOTLIN_LOAD}`,
  `IoCallInLoop 53 JobsAllowed.notAJob loop ${KOTLIN_LOAD}`,
  `IoCallInLoop 17 NightlyJobs.closeOrders loop ${KOTLIN_LOAD}`,
  `IoCallInLoop 24 NightlyJobs.refreshPrices loop ${KOTLIN_REMOTE}`,
  `IoCallInLoop 30 NightlyJobs.reloadEach loop ${KOTLIN_LOAD}`,
  `IoCallInLoop 37 NightlyJobs.rethrown loop ${KOTLIN_LOAD}`,
  'IoCallInLoop 47 NightlyJobs.onBatch loop OrderRepository.deleteById()',
  `IoCallInLoop 54 NightlyJobs.onMessages loop ${KOTLIN_LOAD}`,
  `IoCallInLoop 60 NightlyJobs.execute loop ${KOTLIN_LOAD}`,
  'IoCallInLoop 16 JavaImports.saveEach loop OrderRepository.save()',
  'IoCallInLoop 14 LoopImports.direct loop OrderRepository.deleteById()',
  'IoCallInLoop 18 LoopImports.inlined loop CrudRepository.findByIdOrNull()',
  'IoCallInLoop 21 LoopImports.throughHelper loop OrderLoader.load()>CrudRepository.findByIdOrNull()',
  'IoCallInLoop 24 LoopImports.remote loop OrderLoader.price()>RestClient.get()',
  'IoCallInLoop 27 LoopImports.concurrent concurrent OrderLoader.load()>CrudRepository.findByIdOrNull()',
  'AccumulatorCopyInLoop 6 Accumulators.folded loop acc',
  'AccumulatorCopyInLoop 11 Accumulators.reassigned loop ids',
  'AccumulatorCopyInLoop 18 Accumulators.mapped loop byId',
  'GraphqlFieldPerParent 12 OrderFields.previous spring CrudRepository.findByIdOrNull()',
  'GraphqlFieldPerParent 15 OrderFields.viaHelper spring OrderLoader.load()>CrudRepository.findByIdOrNull()',
  `GraphqlFieldPerParent 18 OrderFields.price spring ${KOTLIN_REMOTE}`,
  'GraphqlFieldPerParent 21 OrderFields.dgsPrevious dgs CrudRepository.findByIdOrNull()',
  'LazyRelationInLoop 4 LazyLoads.customerNames InvoiceRepository.findAll() Invoice.customer',
  'LazyRelationInLoop 9 LazyLoads.lineCount InvoiceRepository.findFrom() Invoice.lines',
  'LazyRelationInLoop 14 LazyLoads.lazySequence InvoiceRepository.findAll() Invoice.lines',
  'ReactiveLookupPerElement 12 OrderStreams.byLambda ReactiveOrders.findById()',
  'ReactiveLookupPerElement 14 OrderStreams.fromIterable OrderStreams.lookup()>ReactiveOrders.findById()',
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
  'RowsChangedInMemory 7 TicketUpdates.expire update TicketRepository.findByStatus() Ticket',
  'RowsChangedInMemory 14 TicketUpdates.close update TicketRepository.findByStatus() Ticket',
  'RowsChangedInMemory 18 TicketUpdates.purge delete TicketRepository.findByStatus() Ticket',
  'EntityLoadedForOneColumn 4 MemberViews.emails MemberRepository.findByTeam() Member.getEmail',
  'EntityLoadedForExistence 6 MemberViews.taken count MemberRepository.countByEmail()',
  'EntityLoadedForExistence 8 MemberViews.known loaded MemberRepository.findByEmail()',
  'RetryWithStaleObject 12 OrderSaves.resend Reactor retry order ReactiveOrders.save()',
  'RetryWithStaleObject 14 OrderSaves.captured Reactor retry order ReactiveOrders.save()',
  'RetryWithStaleObject 19 OrderSaves.loop retry loop order OrderRepository.save()',
  'RetryWithStaleObject 28 OrderSaves.annotated @Retryable order OrderRepository.save()',
  'AsyncMethodDoesBlockingWork 11 OrderFutures.wrapped CompletableFuture.completedFuture() OrderRepository.findById()',
  'WaitOnAsyncTwin 18 OrderFutures.waits OrderFutures.findAsync()',
  `JobLoopWithoutItemIsolation 17 NightlyJobs.closeOrders @Scheduled ${KOTLIN_LOAD}`,
  `JobLoopWithoutItemIsolation 24 NightlyJobs.refreshPrices @Scheduled ${KOTLIN_REMOTE}`,
  `JobLoopWithoutItemIsolation 30 NightlyJobs.reloadEach @Scheduled ${KOTLIN_LOAD}`,
  `JobLoopWithoutItemIsolation 37 NightlyJobs.rethrown @Scheduled ${KOTLIN_LOAD}`,
  'JobLoopWithoutItemIsolation 47 NightlyJobs.onBatch @KafkaListener OrderRepository.deleteById()',
  `JobLoopWithoutItemIsolation 54 NightlyJobs.onMessages @SqsListener ${KOTLIN_LOAD}`,
  `JobLoopWithoutItemIsolation 60 NightlyJobs.execute Quartz Job ${KOTLIN_LOAD}`,
  'SoftDeleteFilterMissing 17 ProductService.ownedBy Product.deletedAt ProductRepository.findByOwner()',
  'SoftDeleteFilterMissing 19 ProductService.like Product.deletedAt ProductRepository.matching()',
  'SoftDeleteFilterMissing 23 ProductService.bySku Product.deletedAt EntityManager.createQuery()',
  'DeletedItemInMemory 73 BasketReports.count Item.deletedAt Basket.getItems()',
  'DeletedItemInMemory 79 BasketReports.quantities Item.deletedAt Basket.getItems()',
  'HandlerWithoutAuth 42 AccountController.export @PreAuthorize 10/11',
];

const SCOPE = 'scope';
const ENTITY = 'entity';

type Field = (name: string) => unknown;

function joined(field: Field, name: string): string {
  return textsOf(field(name)).join('>');
}

function dotted(field: Field, owner: string, member: string): string {
  return `${textOf(field(owner))}.${textOf(field(member))}`;
}

const KEYED_SUMMARIES: readonly (readonly [string, (field: Field) => unknown[]])[] = [
  ['shape', (field) => [field('shape'), `${textOf(field('declared'))}/${textOf(field('total'))}`]],
  ['flag', (field) => [dotted(field, ENTITY, 'flag'), field('source')]],
  ['column', (field) => [dotted(field, ENTITY, 'column'), field('read')]],
  ['job', (field) => [field('job'), joined(field, 'path')]],
  ['read', (field) => [field('read'), field('write')]],
  ['wrapper', (field) => [field('wrapper'), joined(field, 'path')]],
  ['async', (field) => [field('async')]],
  ['object', (field) => [field(SCOPE), field('object'), field('write')]],
  ['framework', (field) => [field('framework'), joined(field, 'path')]],
  [SCOPE, (field) => [field(SCOPE), joined(field, 'path')]],
  ['property', (field) => [field('origin'), dotted(field, ENTITY, 'property')]],
];

function restOf(field: Field): unknown[] {
  const [form, calls, origin, entity, relation] = [
    'form',
    'path',
    'origin',
    ENTITY,
    'relation',
  ].map(field);
  if (entity === undefined && form !== undefined && origin !== undefined) {
    return [form, origin];
  }
  if (entity !== undefined && relation === undefined) {
    return [form, origin, entity];
  }
  if (origin !== undefined) {
    return [origin, dotted(field, ENTITY, 'relation')];
  }
  if (form === undefined && calls !== undefined) {
    return [joined(field, 'path')];
  }
  return [form, calls === undefined ? field('variable') : joined(field, 'path')];
}

function fieldReader(violation: unknown): Field {
  return (name) => fieldOf(violation, name);
}

function summaryOf(violation: unknown): string {
  const field = fieldReader(violation);
  const keyed = KEYED_SUMMARIES.find(([name]) => field(name) !== undefined);
  const details = keyed === undefined ? restOf(field) : keyed[1](field);
  return [field('rule'), field('line'), field('method'), ...details]
    .map((value) => (value === undefined ? '' : textOf(value)))
    .join(' ');
}

export function effectsSummary({ violations }: { violations: readonly unknown[] }): string[] {
  return violations.map(summaryOf);
}
