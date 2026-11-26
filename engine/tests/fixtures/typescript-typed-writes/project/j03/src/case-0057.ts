import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { await fetch(w); } for (const w of ws) { await fetch(w); } } }
export {};
