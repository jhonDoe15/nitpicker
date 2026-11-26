const t = await sequelize.transaction(); await orderRepository.save(o); await fetch(url); await t.commit();
export {};
