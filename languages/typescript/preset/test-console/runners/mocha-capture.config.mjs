import { captureMocha } from './mocha-capture.mjs';

export async function mochaHooks() {
  await captureMocha({ environment: process.env, script: process.argv[1] ?? '' });
  return {};
}
