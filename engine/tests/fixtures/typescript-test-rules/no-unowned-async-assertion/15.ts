import http from 'node:http';
it('x', () => { http.get(url, (res) => { expect(res.statusCode).toBe(200); }); });