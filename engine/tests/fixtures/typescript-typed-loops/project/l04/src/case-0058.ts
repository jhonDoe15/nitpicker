import axios from 'axios'; for (const id of ids) { if (axios.isAxiosError(id)) { log(id); } }
export {};
