import { ByHook } from './store';
export function wire() { (ByHook as any).beforeSave(() => 1); }
