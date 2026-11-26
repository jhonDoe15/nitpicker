import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { for (const z of w) { await fetch(z); } } } }
export {};
