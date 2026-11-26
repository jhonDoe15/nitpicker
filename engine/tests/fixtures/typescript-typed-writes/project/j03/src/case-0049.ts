import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ["a", `b`]) { await fetch(w); } } }
export {};
