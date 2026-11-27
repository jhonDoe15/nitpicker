let page = first; for (let i = 0; i < 3; i++) { page = await client.get(page.next); }
export {};
