import { stripVTControlCharacters } from "node:util";
const { data } = await axios.get(u); process.stdout.write(data.message);