function code(text) {
  return `\`${text}\``;
}

function checkThenWrite({ method, read, write }) {
  return [
    'Make the check and the write one atomic step: read with `@Lock(LockModeType.PESSIMISTIC_WRITE)` inside a',
    'transaction, add a `@Version` column to the entity, use an upsert, or back the check with a unique',
    `constraint: ${code(`${method}()`)} reads with ${code(read)} and then decides a write with ${code(write)},`,
    'so two concurrent callers can both pass the check.',
  ].join(' ');
}

export const RACE_MESSAGES = {
  CheckThenWriteWithoutLock: checkThenWrite,
};
