import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for await (const w of ws) { await fetch(w); } } }
export {};
