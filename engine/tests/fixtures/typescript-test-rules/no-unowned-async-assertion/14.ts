import fs from 'node:fs';
it('x', () => { fs.watch(p, (ev) => expect(ev).toBe('change')); });