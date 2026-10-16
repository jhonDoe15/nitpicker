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
  '[^@/][^/]*-react',
  '@[^/]+/react(?:-[^/]+)?',
  '@[^/]+/[^/]+-react',
  'preact',
  '@preact/[^/]+',
  'next',
  'expo',
  'expo-[^/]+',
  '@expo/[^/]+',
  'vue',
  'svelte',
  'solid-js',
  '@angular/[^/]+',
  'zustand',
  'jotai',
  'valtio',
  'mobx',
  'mobx-react(?:-lite)?',
  'recoil',
  'swr',
  'redux',
  '@reduxjs/[^/]+',
  'motion',
  'framer-motion',
  'styled-components',
  '@emotion/[^/]+',
  '@mui/[^/]+',
  '@chakra-ui/[^/]+',
  '@mantine/[^/]+',
  '@radix-ui/[^/]+',
  '@headlessui/[^/]+',
  'antd',
  '@ant-design/[^/]+',
  '@fortawesome/[^/]+',
  '@iconify/[^/]+',
  '@mdi/[^/]+',
];

export function packageSpecifierPattern(packages) {
  return new RegExp(`^(?:${packages.join('|')})(?:/|$)`, 'u');
}

export function resolvedPackagePattern(packages) {
  return `(?:^|(?:^|/)node_modules/)(?:${packages.join('|')})(?:/|$)`;
}
