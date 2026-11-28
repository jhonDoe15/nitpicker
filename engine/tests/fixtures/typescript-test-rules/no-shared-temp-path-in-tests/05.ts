function reportFor(name) { return join(tmpdir(), `engine-${name}-${process.pid}.json`); }
it("reports", () => { execFileSync(engine, ["--report", reportFor("case")]); });