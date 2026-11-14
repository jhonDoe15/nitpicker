type Formatted = { readonly message: string } | { readonly unformattable: unknown };

const JEST_CONSOLE = '@jest/console';

function formattedMessage(values: readonly unknown[]): Formatted {
  try {
    return {
      message: process.getBuiltinModule('node:util').format(...values),
    };
  } catch (error) {
    return { unformattable: error };
  }
}

function assertMessage(values: readonly unknown[]): readonly unknown[] {
  const formatted =
    values.length > 1 && typeof values[0] === 'string' ? formattedMessage(values) : {};
  return 'message' in formatted ? [formatted.message] : values;
}

function bufferOf(testConsole: object): unknown[] {
  const getBuffer: unknown = Reflect.get(testConsole, 'getBuffer');
  const buffer: unknown =
    typeof getBuffer === 'function' ? Reflect.apply(getBuffer, testConsole, []) : [];
  return Array.isArray(buffer) ? buffer : [];
}

function withoutOwnFrame(buffer: readonly unknown[], before: number): void {
  const entry = buffer.at(-1);
  if (typeof entry !== 'object' || entry === null) {
    return;
  }
  const origin: unknown = buffer.length > before ? Reflect.get(entry, 'origin') : undefined;
  if (typeof origin !== 'string') {
    return;
  }
  const [first = '', ...rest] = origin.split('\n');
  const ownFile = process.getBuiltinModule('node:url').fileURLToPath(import.meta.url);
  if (first.includes(import.meta.url) || first.includes(ownFile)) {
    Reflect.set(entry, 'origin', rest.join('\n'));
  }
}

export function withFormattedAssert(consoleClass: { readonly prototype: object } = Object): void {
  const { prototype } = consoleClass;
  const assert: unknown = Reflect.get(prototype, 'assert');
  if (typeof assert !== 'function') {
    return;
  }
  Reflect.set(prototype, 'assert', function formattedAssert(this: object, ...values: unknown[]) {
    const [value, ...message] = values;
    const passes = Boolean(value);
    if (passes) {
      const passed: unknown = Reflect.apply(assert, this, values);
      return passed;
    }
    const before = bufferOf(this).length;
    const result: unknown = Reflect.apply(assert, this, [value, ...assertMessage(message)]);
    withoutOwnFrame(bufferOf(this), before);
    return result;
  });
}

function isConsoleClass(value: unknown): value is { readonly prototype: object } {
  return typeof value === 'function' && typeof Reflect.get(value, 'prototype') === 'object';
}

function loadedConsoleClass(loaded: unknown): { readonly prototype: object } | undefined {
  const consoleClass: unknown =
    typeof loaded === 'object' && loaded !== null
      ? Reflect.get(loaded, 'BufferedConsole')
      : undefined;
  return isConsoleClass(consoleClass) ? consoleClass : undefined;
}

export function watchJestConsole(loader: object = process.getBuiltinModule('node:module')): {
  readonly watching: boolean;
} {
  const load: unknown = Reflect.get(loader, '_load');
  if (typeof load !== 'function') {
    return { watching: false };
  }
  const patched = new WeakSet<object>();
  Reflect.set(
    loader,
    '_load',
    function loadWatched(this: unknown, request: unknown = '', ...rest: unknown[]) {
      const loaded: unknown = Reflect.apply(load, this, [request, ...rest]);
      const consoleClass = request === JEST_CONSOLE ? loadedConsoleClass(loaded) : undefined;
      if (consoleClass !== undefined && !patched.has(consoleClass)) {
        patched.add(consoleClass);
        withFormattedAssert(consoleClass);
      }
      return loaded;
    },
  );
  return { watching: true };
}
