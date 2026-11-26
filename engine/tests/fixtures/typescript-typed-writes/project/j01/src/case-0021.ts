import Agenda from 'agenda';
const agenda = new Agenda();
agenda.define('sync', async (job) => { for (const workspace of job.attrs.data) { await workspaceRepository.update(workspace.id, {}); } });
export {};
