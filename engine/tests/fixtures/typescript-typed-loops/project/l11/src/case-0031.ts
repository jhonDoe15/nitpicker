await prisma.$transaction(ids.map((id) => prisma.repository.create({ data: { id } })));
export {};
