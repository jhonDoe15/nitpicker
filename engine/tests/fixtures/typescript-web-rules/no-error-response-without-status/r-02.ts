export function h<res>(res: any) { try { run(); } catch (e) { res.json({ error: "x" }); } }
