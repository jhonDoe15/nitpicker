async function f() {
  await db.query('BEGINK');
  await prisma.user.create({ data: {} });
  await prisma.order.create({ data: {} });
}
async function g() {
  await db.query('BEGIN');
  await db.query('COMMITſ');
  await prisma.user.create({ data: {} });
  await prisma.order.create({ data: {} });
}
