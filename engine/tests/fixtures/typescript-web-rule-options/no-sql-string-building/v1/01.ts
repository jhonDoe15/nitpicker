const part0 = `${Number(n)}${Number(n)}${Number(n)}`;
const part1 = c ? part0 : part0;
const part2 = c ? part1 : part1;
const part3 = c ? part2 : part2;
const part4 = c ? part3 : part3;
const part5 = c ? part4 : part4;
const part6 = c ? part5 : part5;
const part7 = c ? part6 : part6;
export const find = () => pool.query(`SELECT * FROM t WHERE x = ${part7}`);