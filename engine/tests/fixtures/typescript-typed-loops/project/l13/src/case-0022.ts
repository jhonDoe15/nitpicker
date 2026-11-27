for (const id of ids) { await userRepository.findOne({ id }).slice('comments', 5).exec(); }
export {};
