function errorFields(error) {
  return error instanceof Error
    ? { ...error, message: error.message, name: error.name }
    : { message: String(error) };
}

export async function runToolInWorker({ url, name, options, port, signal }) {
  try {
    const tools = await import(url);
    tools[name](options);
    port.postMessage({});
  } catch (error) {
    port.postMessage({ error: errorFields(error) });
  } finally {
    Atomics.add(signal, 0, 1);
    Atomics.notify(signal, 0);
  }
}
