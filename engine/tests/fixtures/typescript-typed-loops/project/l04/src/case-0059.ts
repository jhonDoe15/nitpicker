import axios from 'axios'; for (const id of ids) { const client = axios.create({ baseURL: id }); use(client); }
export {};
