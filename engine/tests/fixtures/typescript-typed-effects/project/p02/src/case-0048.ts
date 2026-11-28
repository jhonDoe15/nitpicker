import * as transaction from './store';
export async function go() { await transaction(async () => { await fetch('x'); }); }