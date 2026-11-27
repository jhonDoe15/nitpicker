import { stripVTControlCharacters } from "node:util";
const res = await axios.post(u, x); console.log("Deployed: " + res.data.name);