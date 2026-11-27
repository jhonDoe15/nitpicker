declare const name: string;
function mk(): string { return String.fromCharCode(1); }
namespace mk.B { export type X = 1 }
btoa(mk());
