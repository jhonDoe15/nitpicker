declare const el: any;
const v = 'a';
namespace v.B { export type X = 1 }
el.querySelector('#' + v);
