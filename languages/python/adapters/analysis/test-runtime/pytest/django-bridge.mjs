const IMPORT_BRIDGES = ['django.test', 'rest_framework.test'];
const FIXTURE_BRIDGE = 'pytest-django';
const DATABASE_MARK = 'django_db';
const PYTEST_DJANGO_FIXTURES = new Set([
  'client',
  'admin_client',
  'async_client',
  'rf',
  'async_rf',
  'db',
  'transactional_db',
  'django_db_setup',
  'live_server',
  'admin_user',
  'django_user_model',
  'django_username_field',
  'settings',
  'django_assert_num_queries',
  'django_assert_max_num_queries',
  'mailoutbox',
]);

function importedNames({ level, module, names }) {
  if (level !== 0) {
    return [];
  }
  return module === null ? names : [module, ...names.map((name) => `${module}.${name}`)];
}

function importsFramework(statements, bridge) {
  return statements.some(
    (statement) =>
      statement.typeOnly !== true &&
      importedNames(statement).some((name) => name === bridge || name.startsWith(`${bridge}.`)),
  );
}

function fixtureBridges({ unresolved, marks }) {
  const requested = [...unresolved].some((name) => PYTEST_DJANGO_FIXTURES.has(name));
  return requested || marks.has(DATABASE_MARK) ? [FIXTURE_BRIDGE] : [];
}

export function djangoBridges({ files, imports, fixtures }) {
  return [
    ...IMPORT_BRIDGES.filter((bridge) =>
      files.some((file) => importsFramework(imports[file] ?? [], bridge)),
    ),
    ...fixtureBridges(fixtures),
  ];
}
