import { describe, expect, it } from 'vitest';
import { EFFECTS_MESSAGES } from '../effects-messages.mjs';

describe('the messages of the check-then-write rule', () => {
  it('leads with the atomic forms and names the read and the write', () => {
    const message = EFFECTS_MESSAGES.CheckThenWriteWithoutLock({
      method: 'Registrations.register',
      read: 'MemberRepository.existsByEmail()',
      write: 'MemberRepository.save()',
    });

    expect(message).toBe(
      [
        'Make the check and the write one atomic step: read with `@Lock(LockModeType.PESSIMISTIC_WRITE)` inside a',
        'transaction, add a `@Version` column to the entity, use an upsert, or back the check with a unique',
        'constraint: `Registrations.register()` reads with `MemberRepository.existsByEmail()` and then decides a',
        'write with `MemberRepository.save()`, so two concurrent callers can both pass the check.',
      ].join(' '),
    );
  });
});

describe('the messages of the job loop rule', () => {
  it('names the job, the call path and both allowed forms', () => {
    const message = EFFECTS_MESSAGES.JobLoopWithoutItemIsolation({
      method: 'NightlyJobs.closeOrders',
      job: '@Scheduled',
      kind: 'database',
      path: ['OrderLoader.load()', 'OrderRepository.findById()'],
    });

    expect(message).toBe(
      [
        'Catch the failure of each item inside the loop and record it, or enqueue one job per item so the queue',
        'isolates them: the loop in the `@Scheduled` job `NightlyJobs.closeOrders()` makes a query or write for',
        'each item (calls `OrderLoader.load()`, which calls `OrderRepository.findById()`) with no `try` around',
        'it, so the first item that throws skips every item after it until the next run, and an item that keeps',
        'failing blocks all the others. A job that fails on purpose so that the whole run is retried goes in',
        '`exceptions`.',
      ].join(' '),
    );
  });
});

describe('the messages of the soft-delete filter rule', () => {
  it('names the entity, the column, the project majority and both ways out', () => {
    const message = EFFECTS_MESSAGES.SoftDeleteFilterMissing({
      entity: 'Product',
      column: 'deletedAt',
      read: 'ProductRepository.findByOwner()',
      filtered: 13,
      total: 16,
    });

    expect(message).toBe(
      [
        'Filter out deleted rows with the predicate the other reads of `Product` apply:',
        '`ProductRepository.findByOwner()` reads `Product` without a condition on `deletedAt`, which 13 of the 16',
        'reads of it check, so a deleted row shows up here. Add the condition to the query (or `@SQLRestriction` on',
        'the entity, so every read applies it); a trash, restore or purge read that wants the deleted rows goes in',
        '`exceptions`.',
      ].join(' '),
    );
  });

  it('explains an in-memory loop that keeps deleted items', () => {
    const message = EFFECTS_MESSAGES.DeletedItemInMemory({
      entity: 'Item',
      flag: 'deletedAt',
      source: 'Basket.getItems()',
      guarded: 8,
      units: 10,
    });

    expect(message).toBe(
      [
        'This loop or lookup over `Item` items takes them from `Basket.getItems()` and does not check',
        '`deletedAt`, so deleted items are included. 8 of the 10 places that iterate `Item`',
        'skip the deleted ones: filter here the same way (`item.deletedAt`), load the collection with the filter',
        '(a repository method or `@SQLRestriction`), or, for a view that wants the deleted items, add it to',
        '`exceptions`.',
      ].join(' '),
    );
  });

  it('explains a route handler without the auth requirement the others declare', () => {
    const message = EFFECTS_MESSAGES.HandlerWithoutAuth({
      shape: '@PreAuthorize',
      declared: 10,
      total: 11,
    });

    expect(message).toBe(
      [
        'This route handler declares no authorization, while 10 of the 11 handlers of the project',
        'do (usually `@PreAuthorize`), so it is open to every caller. Add the same requirement to the handler or',
        'its controller class, or mark it public the way the project marks its public routes; a handler that a',
        '`SecurityFilterChain` opens on purpose (login, health) goes in `exceptions` for `effects/HandlerWithoutAuth`.',
      ].join(' '),
    );
  });
});
