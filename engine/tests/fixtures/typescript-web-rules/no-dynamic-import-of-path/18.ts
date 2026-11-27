import path from 'node:path';
const mod = await import(`file:///${path.join(root, 'x.mjs')}`);