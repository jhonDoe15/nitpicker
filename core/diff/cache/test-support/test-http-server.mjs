import { Worker } from 'node:worker_threads';

const SERVER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const http = require('node:http');
const objects = new Map();
const requests = [];
let failWith = 0;
const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const url = request.url;
    if (url === '/__control') {
      const control = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (control.reset) {
        objects.clear();
        requests.length = 0;
        failWith = 0;
      }
      if (control.failWith !== undefined) failWith = control.failWith;
      response.end(JSON.stringify({ requests, keys: [...objects.keys()] }));
      return;
    }
    requests.push({ method: request.method, url, authorization: request.headers.authorization });
    if (failWith !== 0) {
      response.statusCode = failWith;
      response.end();
      return;
    }
    if (workerData.token !== undefined && request.headers.authorization !== 'Bearer ' + workerData.token) {
      response.statusCode = 401;
      response.end();
      return;
    }
    if (request.method === 'PUT') {
      objects.set(url, Buffer.concat(chunks).toString());
      response.statusCode = 200;
      response.end();
    } else if (objects.has(url)) {
      response.end(objects.get(url));
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
});
server.listen(0, '127.0.0.1', () => parentPort.postMessage({ port: server.address().port }));
parentPort.on('message', () => server.close());
`;

export async function startTestHttpServer({ token } = {}) {
  const worker = new Worker(SERVER_SOURCE, { eval: true, workerData: { token } });
  const { port } = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  const url = `http://127.0.0.1:${String(port)}`;
  async function control(body = {}) {
    return (await fetch(`${url}/__control`, { method: 'POST', body: JSON.stringify(body) })).json();
  }
  return {
    url,
    port,
    requests: async () => (await control()).requests,
    keys: async () => (await control()).keys,
    failWith: (status) => control({ failWith: status }),
    close: () => worker.terminate(),
  };
}

export async function resetTestHttpServer(url) {
  await fetch(`${url}/__control`, { method: 'POST', body: JSON.stringify({ reset: true }) });
}
