const JEST_CONSOLE = '@jest/console';

function assertMessage(values = [{}].slice(1)) {
  return values.length > 1 && typeof values[0] === 'string'
    ? [Reflect.apply(process.getBuiltinModule('node:util').format, undefined, values)]
    : values;
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
    return Reflect.apply(assert, this, value ? values : [value, ...assertMessage(message)]);
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
