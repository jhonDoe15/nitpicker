import http from 'node:http';
it('x', () => { http.createServer((req) => { expect(req.url).toBe('/'); }); });