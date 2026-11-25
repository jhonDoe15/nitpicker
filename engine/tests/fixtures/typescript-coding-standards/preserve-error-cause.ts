declare function run(): void;
declare const other: unknown;

try { run(); } catch (error) { throw new AppError('failed', { cause: error }); }
try { run(); } catch (error) { throw new AppError('failed', 500, { cause: error }); }
try { run(); } catch (error) { throw new WrapError('failed', error); }
try { run(); } catch { return new AppError('failed'); }
try { run(); } catch (error) { const failure = new AppError('failed', { cause: error }); throw failure; }
try { run(); } catch (error) { return Promise.reject(new AppError('failed', { cause: error })); }
try { run(); } catch (error) { const failure = new AppError('failed'); return failure; }
try { run(); } catch (error) { throw new Wrapper(String(error)); }
try { run(); } catch (error) { throw new AggregateError([error, other], 'run and close failed'); }
try { run(); } catch (error) { const cause = error; throw new AppError('bad', { cause }); }
try { run(); } catch (error) { throw new Error('failed', { cause: error }); }
try { run(); } catch (error) { throw new Error('failed', { 'cause': error }); }

try { run(); } catch (error) { throw new AggregateError([other], 'failed'); }
try { run(); } catch (error) { const cause = String(error); throw new AppError('bad', { cause: other }); }
try { run(); } catch (error) { throw new AppError(String(error)); }
try { run(); } catch (error) { throw new AppError(`bad ${error instanceof Error ? error.message : 'x'}`); }
try { run(); } catch (error) { throw new Error('failed'); }
try { run(); } catch (error) { throw new Error(String(error)); }
try { run(); } catch { throw new AppError('failed'); }
try { run(); } catch { return Promise.reject(new AppError('failed')); }
try { run(); } catch { const failure = new AppError('failed'); throw failure; }
try { run(); } catch (error) { const failure = new AppError('failed'); throw failure; }
try { run(); } catch (error) { throw new AppError('failed', { cause: other }); }
try { run(); } catch ({ message }) { throw new AppError(message); }
