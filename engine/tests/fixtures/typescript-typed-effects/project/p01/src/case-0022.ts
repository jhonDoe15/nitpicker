const runner = dataSource.createQueryRunner(); await runner.startTransaction(); await runner.manager.save(order); await axiosClient.post(url); await runner.commitTransaction();
export {};
