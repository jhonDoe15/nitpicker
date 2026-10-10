/**
 * Module roles the runtime-boundary analyzer enforces. Each role selects production modules by
 * `modules` globs (relative to `src/main`) and lists `forbiddenDependencies` and
 * `forbiddenCalls` globs. The default declares no roles; add roles for your project's
 * architecture.
 */
export const moduleRoleBoundaries = {
  roles: [],
  exclude: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/dist/**',
    '**/build/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/reports/**',
    '**/target/**',
  ],
};
