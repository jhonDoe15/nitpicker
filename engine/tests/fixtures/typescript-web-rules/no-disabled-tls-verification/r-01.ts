declare const g: any;
let A: any = true;
[(A as any)] = false;
g({ rejectUnauthorized: A });
let B: any = true;
({ a: (B!) } = false);
g({ rejectUnauthorized: B });
let C: any = true;
[(<any>C) = false] = true;
g({ rejectUnauthorized: C });
let D: any = true;
for (((D as any) as any) of false) {}
g({ rejectUnauthorized: D });
let E: any = true;
[(E satisfies any)] = false;
g({ rejectUnauthorized: E });
