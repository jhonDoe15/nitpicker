import type { LoggerLibrary } from './typed/library-types.mts';

const CAUGHT_VALUE = 'caught-value';

export const LOGGER_LIBRARIES: readonly LoggerLibrary[] = [
  { id: 'pino', packages: ['pino', 'nestjs-pino', 'pino-http'], shape: 'err-field' },
  { id: 'bunyan', packages: ['bunyan'], shape: 'err-field' },
  { id: 'winston', packages: ['winston'], shape: CAUGHT_VALUE },
  { id: 'log4js', packages: ['log4js'], shape: CAUGHT_VALUE },
  { id: 'loglevel', packages: ['loglevel'], shape: CAUGHT_VALUE },
  { id: 'consola', packages: ['consola'], shape: CAUGHT_VALUE },
  { id: 'tslog', packages: ['tslog'], shape: CAUGHT_VALUE },
  { id: 'roarr', packages: ['roarr'], shape: CAUGHT_VALUE },
  { id: 'signale', packages: ['signale'], shape: CAUGHT_VALUE },
];
