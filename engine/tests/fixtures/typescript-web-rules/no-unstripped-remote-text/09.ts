import { stripVTControlCharacters } from "node:util";
const res = await axios.get(u); console.log(res.status, res.headers);