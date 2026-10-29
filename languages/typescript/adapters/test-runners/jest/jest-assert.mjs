const JEST_CONSOLE = '@jest/console';

function formattedMessage(values = [{}].slice(1)) {
  try {
    return {
      message: Reflect.apply(process.getBuiltinModule('node:util').format, undefined, values),
    };
  } catch (error) {
    return { unformattable: error };
  }
}

function assertMessage(values = [{}].slice(1)) {
  const formatted =
    values.length > 1 && typeof values[0] === 'string' ? formattedMessage(values) : {};
  return 'message' in formatted ? [formatted.message] : values;
}

function bufferOf(testConsole = {}) {
  const getBuffer = Reflect.get(testConsole, 'getBuffer');
  const buffer = typeof getBuffer === 'function' ? Reflect.apply(getBuffer, testConsole, []) : [];
  return Array.isArray(buffer) ? buffer : [];
}

function withoutOwnFrame(buffer = [{}], before = 0) {
  const entry = buffer.at(-1);
  const origin = buffer.length > before ? Reflect.get(entry ?? {}, 'origin') : undefined;
  if (typeof origin !== 'string') {
    return;
  }
  const [first = '', ...rest] = origin.split('\n');
  const ownFile = process.getBuiltinModule('node:url').fileURLToPath(import.meta.url);
  if (first.includes(import.meta.url) || first.includes(ownFile)) {
    Reflect.set(entry, 'origin', rest.join('\n'));
  }
}

export function withFormattedAssert(consoleClass = Object, patched = new WeakSet()) {
  const { prototype } = consoleClass;
  const assert = Reflect.get(prototype, 'assert');
  if (typeof assert !== 'function' || patched.has(prototype)) {
    return;
  }
  patched.add(prototype);
  Reflect.set(prototype, 'assert', function formattedAssert(...values) {
    const [value, ...message] = values;
    if (value) {
      return Reflect.apply(assert, this, values);
    }
    const before = bufferOf(this).length;
    const result = Reflect.apply(assert, this, [value, ...assertMessage(message)]);
    withoutOwnFrame(bufferOf(this), before);
    return result;
  });
}

function loadedConsoleClass(loaded = {}) {
  const consoleClass = Reflect.get(loaded, 'BufferedConsole');
  return typeof consoleClass === 'function' ? consoleClass : undefined;
}

export function watchJestConsole(loader = process.getBuiltinModule('node:module')) {
  const load = Reflect.get(loader, '_load');
  if (typeof load !== 'function') {
    return { watching: false };
  }
  const patched = new WeakSet();
  Reflect.set(loader, '_load', function loadWatched(request = '', ...rest) {
    const loaded = Reflect.apply(load, this, [request, ...rest]);
    const consoleClass = request === JEST_CONSOLE ? loadedConsoleClass(loaded) : undefined;
    if (consoleClass !== undefined) {
      withFormattedAssert(consoleClass, patched);
    }
    return loaded;
  });
  return { watching: true };
}
