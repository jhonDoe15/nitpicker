import fs from 'node:fs';
async function load(resolvedPath: string) { return import(resolvedPath); }