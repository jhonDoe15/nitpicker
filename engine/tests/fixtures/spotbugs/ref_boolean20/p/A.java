package p;
public class A {
    static Boolean sa = Boolean.TRUE, sb = Boolean.FALSE;
    Boolean fa = Boolean.TRUE, fb = Boolean.valueOf(false);
    boolean i1 = fa == fb;
    boolean i2;
    { i2 = fa != fb; }
    static boolean s1 = sa == sb;
    static boolean s2;
    static { s2 = sb != sa; }
    A() { }
    A(int x) { this(); }
    A(String s) { super(); boolean q = fa == fb; }
    A(long l) { boolean q = fa == fb; this.i2 = fa == fb; }
    boolean m(Boolean a, Boolean b) { return a == b; }
}
interface I {
    Boolean K = Boolean.TRUE;
    default boolean d(Boolean a, Boolean b) { return a == b; }
    static boolean s(Boolean a, Boolean b) { return a != b; }
    private boolean pv(Boolean a) { return a == K; }
}
enum E {
    X(Boolean.TRUE, Boolean.FALSE) {
        boolean g(Boolean a, Boolean b) { return a == b; }
    },
    Y(Boolean.TRUE, Boolean.TRUE) {
        { boolean z = p == q; }
        boolean g(Boolean a, Boolean b) { return a == b; }
    };
    final Boolean p, q;
    boolean k = Boolean.TRUE == Boolean.FALSE;
    E(Boolean p, Boolean q) { this.p = p; this.q = q; boolean z = p == q; }
    abstract boolean g(Boolean a, Boolean b);
}
record R(Boolean a, Boolean b) {
    R {
        boolean z = a == b;
    }
    boolean e() { return a == b; }
    boolean e2(R o) { return a == o.a; }
    static boolean f(Boolean a, Boolean b) { return a == b; }
}
record R2(Boolean a, Boolean b) {
    R2(Boolean a) { this(a, a); boolean q = a == null; }
    public boolean equals(Object o) { return o instanceof R2 r && r.a == a && r.b != b; }
}
class Outer {
    Boolean f;
    class In {
        Boolean g;
        boolean m() { return f == g; }
        { boolean z = f == g; }
    }
    static class SN {
        static Boolean h;
        boolean m(Boolean a) { return h == a; }
    }
    void loc(Boolean a, Boolean b) {
        class L { boolean m() { return a == b; } { boolean z = a == b; } }
        Object o = new Object() { boolean m() { return a == b; } Boolean w = a; boolean z = w == b; };
    }
}
