import crypto from 'crypto';
const alg = 'md5';
try {} catch ({ alg }) { crypto.createHash(alg); }
