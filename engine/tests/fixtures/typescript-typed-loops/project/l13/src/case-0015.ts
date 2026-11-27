for (const id of ids) { const name = this.queryRunner.connection.driver.createParameter('p_' + id, 0); use(name); }
export {};
