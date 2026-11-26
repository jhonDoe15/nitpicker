import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { async function inner() { for (const w of ws) { await fetch(w); } } inner(); } }
export {};
