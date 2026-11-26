import { Cron, Interval, Timeout } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run() { for (const step of ["a", "b"]) { await this.workspaceRepository.update(step, {}); } } }
export {};
