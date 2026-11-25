declare const logger: any;
declare function execute(): void;
declare function toError(error: unknown): Error;

export function accepted(): void {
  try { execute(); } catch (error) { logger.error({ err: error, operation: 'execute' }, 'failed'); }
  try { execute(); } catch (error) { logger.warn({ err: toError(error) }, 'degraded'); }
  logger.error({ error: 'business-state' }, 'business failure');
  try { execute(); } catch (error) { const fields = { err: error, category: 'network' }; logger.error(fields, 'failed'); }
  try { execute(); } catch (error) { logger.error({ 'err': error }, `failed`); }
  try { execute(); } catch (error) { logger.info('not about the caught value'); }
  try { execute(); } catch (error) { const e2 = error; logger.error({ err: e2 }, 'failed'); }
}

export function reported(): void {
  try { execute(); } catch (error) { logger.error(error, 'failed'); }
  try { execute(); } catch (error) { logger.error({ error }, 'failed'); }
  try { execute(); } catch (error) { logger.error({ err: error }, { operation: 'execute' }, 'failed'); }
  try { execute(); } catch (error) { logger.error('failed', error); }
  try { execute(); } catch (error) { logger.warn({ err: (error as Error).message }, 'failed'); }
  try { execute(); } catch (error) { logger.warn({ err: error.message }, 'failed'); }
  try { execute(); } catch (error) { logger.error({ err: error }); }
  try { execute(); } catch (error) { logger.error({ err: error }, 'failed', 'again'); }
  try { execute(); } catch (error) { const message = error instanceof Error ? error.message : 'x'; logger.warn({ error: message }, 'failed'); }
  try { execute(); } catch (error) { logger.error(`failed ${String(error)}`); }
  try { execute(); } catch (error) { try { execute(); } catch (inner) { logger.error(error, 'outer'); } }
  try { execute(); } catch ({ message }) { logger.error({ message }, 'failed'); }
}
