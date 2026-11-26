import Agenda from 'agenda';
const a = new Agenda();
a.define('x', async () => { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } });
export {};
