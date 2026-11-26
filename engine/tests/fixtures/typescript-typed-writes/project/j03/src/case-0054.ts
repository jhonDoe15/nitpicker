import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { const f = async () => { for (const w of ws) { await fetch(w); } }; } }
export {};
