// Child process used by the HTTP cache store: the comparison is synchronous, so each request runs
// in a short-lived `node` that does the (asynchronous) fetch. Usage: <GET|PUT> <url> <timeoutMs>.
// The optional auth header arrives in NITPICKER_CACHE_AUTH_HEADER_VALUE, never on the command line.
// Exit codes: 0 success (GET prints the body), 3 not found, 1 any other failure.
const [method, url, timeoutText] = process.argv.slice(2);
const headers = { 'user-agent': 'nitpicker-findings-cache' };
const rawHeader = process.env.NITPICKER_CACHE_AUTH_HEADER_VALUE;
if (rawHeader) {
  const separator = rawHeader.indexOf(':');
  if (separator > 0) {
    headers[rawHeader.slice(0, separator).trim()] = rawHeader.slice(separator + 1).trim();
  }
}

try {
  let body;
  if (method === 'PUT') {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    body = Buffer.concat(chunks);
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(Number(timeoutText)),
  });
  if (method === 'GET' && (response.status === 404 || response.status === 403)) {
    // S3 answers 403 for a missing key when the caller may not list the bucket.
    process.exit(3);
  }
  if (!response.ok) {
    process.exit(1);
  }
  if (method === 'GET') {
    process.stdout.write(Buffer.from(await response.arrayBuffer()));
  }
} catch (error) {
  void error;
  process.exit(1);
}
