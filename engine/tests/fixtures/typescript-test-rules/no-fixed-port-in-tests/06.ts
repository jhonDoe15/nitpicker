const server = app.listen(3000);
test.each([1, 2])("serves %i", () => { app.listen(9000); });
it("serves", () => { app.listen(70000); app.listen(0); });
