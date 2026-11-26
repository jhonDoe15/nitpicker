import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { await Promise.all(ws.map(async (w) => { for (const z of w) { await fetch(z); } })); } }
export {};
