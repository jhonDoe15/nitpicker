export const LOGGER_LIBRARIES = [
  { id: 'pino', packages: ['pino', 'nestjs-pino', 'pino-http'], errorField: true },
  { id: 'bunyan', packages: ['bunyan'], errorField: true },
  { id: 'winston', packages: ['winston'], errorField: false },
  { id: 'log4js', packages: ['log4js'], errorField: false },
  { id: 'loglevel', packages: ['loglevel'], errorField: false },
  { id: 'consola', packages: ['consola'], errorField: false },
  { id: 'tslog', packages: ['tslog'], errorField: false },
  { id: 'roarr', packages: ['roarr'], errorField: false },
  { id: 'signale', packages: ['signale'], errorField: false },
];
