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
