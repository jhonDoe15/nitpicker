export function docCommentRule(ids) {
  return {
    id: ids.docCommentContent,
    check: 'coding-standards',
    limit:
      'a doc comment that only restates its declaration name, or a description longer than 5 lines (TypeScript and JavaScript report it as `nitpicker/no-comments`)',
  };
}
