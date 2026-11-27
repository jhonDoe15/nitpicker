ids.forEach(async (id) => { await userRepository.save(id); });
export {};
