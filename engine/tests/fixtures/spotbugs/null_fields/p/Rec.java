package p;
public record Rec(@Nullable X a, X b) {
    int r1() { return a.foo(); }
    int r2() { return a().foo(); }
    static int r3(Rec r) { return r.a().foo(); }
    static int r4(Rec r) { return r.a.foo(); }
}
