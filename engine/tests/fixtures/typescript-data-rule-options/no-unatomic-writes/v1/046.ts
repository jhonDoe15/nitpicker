async function f() {
  await db.query(`BEGIN`);
  await prisma.user.create({ data: {} });
  await prisma.order.create({ data: {} });
}
