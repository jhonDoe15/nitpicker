import { projectDependencies } from '../../../orm/project-files.mts';

const SUPPORTED = ['pg', 'mysql', 'mysql2', 'mariadb'];
const UNSUPPORTED = [
  'sqlite3',
  'better-sqlite3',
  'sql.js',
  'sqlite',
  'expo-sqlite',
  'react-native-sqlite-storage',
  'cordova-sqlite-storage',
  '@sqlite.org/sqlite-wasm',
  'mssql',
  'tedious',
  'oracledb',
  '@sap/hana-client',
  'hdb-pool',
  'mongodb',
];

export function isSupportedDriver(filename: string): boolean {
  const dependencies = projectDependencies(filename);
  return (
    SUPPORTED.some((name) => dependencies.has(name)) &&
    !UNSUPPORTED.some((name) => dependencies.has(name))
  );
}
