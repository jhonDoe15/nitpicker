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
