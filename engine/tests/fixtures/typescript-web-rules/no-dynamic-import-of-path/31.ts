import fs from 'node:fs';
const { configPath } = await locate(root); const mod = await import(configPath);