let page; do { page = await repository.findPage(cursor); cursor = page.next; } while (cursor);
export {};
