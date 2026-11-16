import { captureMocha } from './mocha-capture.mts';

export async function mochaHooks(): Promise<object> {
  await captureMocha({ environment: process.env, script: process.argv[1] ?? '' });
  return {};
}
