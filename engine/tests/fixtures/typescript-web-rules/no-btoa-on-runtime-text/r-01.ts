declare const name: string, other: string, ok: boolean;
let v = name;
[v!] = [String.fromCharCode(1)];
btoa(v);
