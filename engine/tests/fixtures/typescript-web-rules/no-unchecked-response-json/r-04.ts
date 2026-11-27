async function f(u: string) { const res = await fetch(u); let t: typeof res; return res.json(); }
