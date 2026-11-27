import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = import(path.resolve(root, 'x.js'));
export default mod;