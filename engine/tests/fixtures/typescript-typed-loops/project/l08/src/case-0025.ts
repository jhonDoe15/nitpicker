for (const user of users) { try { await prisma.user.create({ data: user }); } catch (error) { await prisma.user.findUnique({ where: { email: user.email } }); } }
export {};
