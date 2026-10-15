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
    process.exit(3);
  }
  if (!response.ok) {
    process.exit(1);
  }
  if (method === 'GET') {
    process.stdout.write(Buffer.from(await response.arrayBuffer()));
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
