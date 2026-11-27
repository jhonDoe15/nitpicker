const GLOB = 'src/**/*.ts';
export function allow(path: string) { return new RegExp(GLOB.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')).test(path); }