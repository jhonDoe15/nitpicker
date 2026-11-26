import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}).then(() => 1, function (e) { return 2; }); } } }
export {};
