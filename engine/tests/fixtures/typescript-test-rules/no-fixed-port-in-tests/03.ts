describe("api", () => { beforeEach(() => { server.listen({ port: 3002 }); }); });
it("serves", async () => { const wss = new WebSocket.Server({ port: 8081 }); });
