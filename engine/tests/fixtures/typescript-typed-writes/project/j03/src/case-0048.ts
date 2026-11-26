import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of [,1]) { await fetch(w); } } }
export {};
