test.each`
 a
 ${1}
`('x', () => { setTimeout(() => expect(a).toBe(1)); });