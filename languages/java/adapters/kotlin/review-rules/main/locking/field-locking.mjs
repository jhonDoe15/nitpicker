import { classView, enclosingClass, heldLocks, unitOf } from './lock-scopes.mjs';

export const FIELD_LOCKING_RULE = 'InconsistentFieldLocking';

const CONCURRENT =
  /^(?:[\w.]+\.)?(?:Atomic\w*|Concurrent\w*|CopyOnWrite\w*|(?:Long|Double)(?:Adder|Accumulator)|\w*Blocking(?:Queue|Deque))\b/u;

function message({ member, name, locked }) {
  return `\`${member}\` writes \`${name}\` without a lock, while \`${locked.member}\` writes it holding \`${locked.lock}\`: a thread that writes here races with the locked writer, so an update is lost or another thread sees a stale value. Hold the same lock for every write of the property (\`synchronized(lock) { }\`, \`lock.withLock { }\` or \`@Synchronized\`), or make it an atomic or concurrent type (\`AtomicLong\`, \`LongAdder\`, \`ConcurrentHashMap\`).`;
}

function isConcurrent(property) {
  return [property.type, property.initializer].some(
    (text) => typeof text === 'string' && CONCURRENT.test(text),
  );
}

function properties(klass, { file, view }) {
  const declared = file.properties
    .filter(({ owner }) => owner === klass.qualified)
    .filter((property) => property.var && !property.delegated && !isConcurrent(property))
    .map((property) => [property.name, property.annotations.includes('Volatile')]);
  const parameters = (view.get(klass.qualified)?.primaryParameters ?? [])
    .filter((parameter) => parameter.property === 'var' && !isConcurrent(parameter))
    .map((parameter) => [parameter.name, (parameter.annotations ?? []).includes('Volatile')]);
  return new Map([...declared, ...parameters]);
}

function writesOf(file, view) {
  return (file.fieldWrites ?? []).flatMap((write) => {
    const klass = enclosingClass(write);
    const unit = unitOf(write);
    if (klass === undefined || unit?.k !== 'fun' || unit.name === '<init>') {
      return [];
    }
    if (!write.viaThis && write.locals.includes(write.target)) {
      return [];
    }
    const site = { file, view };
    const volatile = properties(klass, site).get(write.target);
    const { held, opaque } = heldLocks(write, { klass, site });
    return volatile === undefined || opaque
      ? []
      : [{ write, klass, volatile, held, member: unit.name }];
  });
}

function calledLocked(entry, file) {
  return (file.lockedCalls ?? []).some(
    (call) =>
      call.name === entry.member && enclosingClass(call)?.qualified === entry.klass.qualified,
  );
}

function singleWrite({ write }) {
  return write.operator === '=' && !write.readsTarget;
}

export function fieldLockingFindings(files, { finding, declaredIn = files }) {
  const view = classView(declaredIn);
  return files.flatMap((file) => {
    const writes = writesOf(file, view);
    return writes.flatMap((entry) => {
      if (
        entry.held.length > 0 ||
        (entry.volatile && singleWrite(entry)) ||
        calledLocked(entry, file)
      ) {
        return [];
      }
      const locked = writes
        .filter(
          (other) =>
            other.klass.qualified === entry.klass.qualified &&
            other.write.target === entry.write.target,
        )
        .map((other) => ({ member: other.member, lock: other.held.find((key) => key !== '?') }))
        .find(({ lock }) => lock !== undefined);
      if (locked === undefined) {
        return [];
      }
      return [
        finding({
          rule: FIELD_LOCKING_RULE,
          file: file.file,
          line: entry.write.line,
          symbol: `${entry.klass.qualified}.${entry.write.target} in ${entry.member}`,
          message: message({ member: entry.member, name: entry.write.target, locked }),
        }),
      ];
    });
  });
}
