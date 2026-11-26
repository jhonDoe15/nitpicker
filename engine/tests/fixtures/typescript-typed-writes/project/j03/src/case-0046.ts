import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { if (w) { await fetch(w.url); } } } }
export {};
