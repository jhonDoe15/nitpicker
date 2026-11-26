await prisma.$transaction([prisma.order.create({}), prisma.user.create({})]); await fetch(url);
export {};
