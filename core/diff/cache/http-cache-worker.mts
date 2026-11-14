import { realpathSync } from 'node:fs';
import { readStandardInput } from '../../../shared/processes/standard-input.mts';

const MISSING_EXIT_CODE = 3;

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'user-agent': 'nitpicker-findings-cache' };
  const rawHeader = process.env['NITPICKER_CACHE_AUTH_HEADER_VALUE'];
  if (rawHeader !== undefined && rawHeader !== '') {
    const separator = rawHeader.indexOf(':');
    if (separator > 0) {
      headers[rawHeader.slice(0, separator).trim()] = rawHeader.slice(separator + 1).trim();
    }
  }
  return headers;
}

async function finishResponse(method: string | undefined, response: Response): Promise<void> {
  if (method === 'GET' && (response.status === 404 || response.status === 403)) {
    process.exit(MISSING_EXIT_CODE);
  }
  if (!response.ok) {
    process.exit(1);
  }
  if (method === 'GET') {
    process.stdout.write(Buffer.from(await response.arrayBuffer()));
  }
}

async function requestCache(commandArguments: readonly string[]): Promise<void> {
  const [method, url, timeoutText] = commandArguments;
  const headers = requestHeaders();
  try {
    let body: string | undefined;
    if (method === 'PUT') {
      body = (await readStandardInput()).toString('utf8');
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(String(url), {
      ...(method === undefined ? {} : { method }),
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: 'follow',
      signal: AbortSignal.timeout(Number(timeoutText)),
    });
    await finishResponse(method, response);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1];

if (invokedPath !== undefined && realpathSync(invokedPath) === import.meta.filename) {
  await requestCache(process.argv.slice(2));
}
