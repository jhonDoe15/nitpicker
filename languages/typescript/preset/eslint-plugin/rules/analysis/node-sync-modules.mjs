function nodeModule(name) {
  return [name, `node:${name}`];
}

export const FS_MODULES = [...nodeModule('fs'), 'graceful-fs'];
export const FS_EXTRA_MODULES = ['fs-extra'];
export const CHILD_PROCESS_MODULES = nodeModule('child_process');
export const CRYPTO_MODULES = nodeModule('crypto');
export const ZLIB_MODULES = nodeModule('zlib');
export const EXECA_MODULES = ['execa'];

export const SYNC_API_MODULES = [
  ...FS_MODULES,
  ...FS_EXTRA_MODULES,
  ...CHILD_PROCESS_MODULES,
  ...CRYPTO_MODULES,
  ...ZLIB_MODULES,
  ...EXECA_MODULES,
];
