package p;
record R1(Boolean a, Boolean b) {
    boolean e() { return a == b; }
}
record R2(Boolean a, Boolean b) {
    R2 { boolean z = a == b; }
    boolean e() { return a == b; }
}
record R3(Boolean a, Boolean b) {
    R3(Boolean a, Boolean b) { this.a = a; this.b = b; boolean z = a == b; }
    boolean e() { return a == b; }
    boolean e2() { return this.a == b; }
}
record R4(Boolean a, Boolean b) {
    R4 { }
    boolean e() { return a == b; }
}
record R5(Boolean a, Boolean b) {
    boolean e() { return a == b; }
    R5 { boolean z = a == b; }
}
enum E1 {
    X { { boolean z = p == q; } },
    Y { boolean g() { return p == q; } };
    final Boolean p = Boolean.TRUE, q = Boolean.FALSE;
    boolean g() { return p == q; }
}
enum E2 {
    X(null) { { boolean z = p == q; } };
    final Boolean p = Boolean.TRUE, q;
    E2(Boolean q) { this.q = q; }
}
class C {
    final Boolean p = Boolean.TRUE; Boolean q;
    static C make() { return new C() { { boolean z = p == q; } }; }
}
