export async function run(order) { await orderRepository.save(order); await httpClient.post(order); }
export {};
