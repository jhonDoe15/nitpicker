export const LOGGER_LIBRARIES = [
  { id: 'pino', packages: ['pino', 'nestjs-pino', 'pino-http'], shape: 'err-field' },
  { id: 'bunyan', packages: ['bunyan'], shape: 'err-field' },
  { id: 'winston', packages: ['winston'], shape: 'caught-value' },
  { id: 'log4js', packages: ['log4js'], shape: 'caught-value' },
  { id: 'loglevel', packages: ['loglevel'], shape: 'caught-value' },
  { id: 'consola', packages: ['consola'], shape: 'caught-value' },
  { id: 'tslog', packages: ['tslog'], shape: 'caught-value' },
  { id: 'roarr', packages: ['roarr'], shape: 'caught-value' },
  { id: 'signale', packages: ['signale'], shape: 'caught-value' },
];
