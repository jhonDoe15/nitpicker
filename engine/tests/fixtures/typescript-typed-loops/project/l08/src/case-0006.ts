while (!isDone) { const run = await this.runRepository.findOneBy({ id: runId }); isDone = run.status === "done"; await this.wait(1000); }
export {};
