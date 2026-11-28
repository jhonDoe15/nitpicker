const m = new Map();
async function f(db: any) {
  await db.transaction(async (tx: any) => {
    const v0 = await tx.save(1);
    const v1 = { v0 };
    const v2 = { v1 };
    const v3 = { v2 };
    const v4 = { v3 };
    m.set('k', v4);
  });
}
