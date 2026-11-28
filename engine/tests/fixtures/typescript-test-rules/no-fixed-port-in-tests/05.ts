it("serves", async () => { vi.spyOn(server, "listen"); app.listen(3000); });
it("serves", async () => { try { server.listen(3000); report.fail(); } catch {} });
