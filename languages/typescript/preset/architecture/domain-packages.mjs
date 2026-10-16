export const networkAndDatabaseClients = [
  'axios',
  'node-fetch',
  'undici',
  'got',
  'ky',
  'ws',
  'pg',
  'mysql',
  'mysql2',
  'mongodb',
  'mongoose',
  'redis',
  'ioredis',
  'sqlite3',
  'better-sqlite3',
  'knex',
  'sequelize',
  'typeorm',
  'drizzle-orm',
  '@prisma/client',
  '@aws-sdk/[^/]+',
];

export const loggers = ['pino', 'winston', 'bunyan', 'log4js', 'loglevel', 'consola', 'debug'];

export const idAndRandomLibraries = [
  'uuid',
  'nanoid',
  'cuid',
  '@paralleldrive/cuid2',
  'ulid',
  '@faker-js/faker',
  'faker',
];

export const uiFrameworks = [
  'react',
  'react-[^/]+',
  '@[^/]+/react(?:-[^/]+)?',
  'preact',
  'next',
  'expo',
  'expo-[^/]+',
  'zustand',
  'jotai',
  'valtio',
  'mobx',
  'mobx-react(?:-lite)?',
  'recoil',
  'swr',
];

export function packageSpecifierPattern(packages) {
  return new RegExp(`^(?:${packages.join('|')})(?:/|$)`, 'u');
}

export function resolvedPackagePattern(packages) {
  return `(?:^|(?:^|/)node_modules/)(?:${packages.join('|')})(?:/|$)`;
}
