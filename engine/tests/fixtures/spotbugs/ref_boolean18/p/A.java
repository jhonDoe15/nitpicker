package p;
public class A {
    Boolean f, g;
    static Boolean sf;
    boolean bp;
    static void x() { }
    Boolean y() { return f; }
    boolean k1() { Boolean l = f; x(); return l == f; }
    boolean k2() { Boolean l = f; g = null; return l == f; }
    boolean k3() { Boolean l = f; f = null; return l == f; }
    boolean k4(boolean c) { Boolean l = f; if (c) { g = null; } return l == f; }
    boolean k5(boolean c) { Boolean l = f; if (c) { x(); } return l == f; }
    boolean k6(A o) { Boolean l = o.f; return l == o.f; }
    boolean k7(A o) { Boolean l = f; return l == o.f; }
    boolean k8() { Boolean l = sf; x(); return l == sf; }
    boolean k9() { Boolean l = sf; return l == sf; }
    boolean k10() { Boolean l = f; Boolean m = new Boolean(true); return l == f; }
    boolean k11() { Boolean l = f; int[] q = new int[1]; return l == f; }
    boolean k12() { Boolean l = f; synchronized (this) { } return l == f; }
    boolean k13() { Boolean l = y(); return l == y(); }
    boolean n1(Boolean a, boolean p) { return Boolean.valueOf(p) == a; }
    boolean n2(Boolean a) { return a == Boolean.valueOf(bp); }
    boolean n3(Boolean a) { return a == Boolean.valueOf(f); }
    boolean n4(Boolean a, boolean p) { return a == Boolean.valueOf(!p); }
    boolean n5(Boolean a, String s) { return a == Boolean.valueOf(s); }
    boolean n6(Boolean a, boolean p) { return a == (Boolean) p; }
    boolean n7(Boolean a, boolean p) { Boolean b = p; return a == b; }
    boolean n8(Boolean a, boolean p) { return (Boolean) p == a; }
    boolean s1(Boolean a) { Boolean x = a; Boolean y = x; return y == f; }
    boolean s2(Boolean a) { Boolean x = f; Boolean y = x; return y == a; }
    boolean s3(Boolean a) { { Boolean t = a; } Boolean x = f; return x == a; }
    boolean s4(long w, Boolean a) { Boolean x = f; Boolean y = f; return y == a; }
    boolean s5(Boolean a) { Boolean x = f; Boolean y = x; x = null; return y == a; }
    boolean s6(Boolean a, boolean c) { Boolean x = f; if (c) x = a; return x == a; }
    boolean s7(Boolean a, boolean c) { Boolean x = a; while (c) { x = f; } return x == a; }
    boolean s8(Boolean a, boolean c) { Boolean x = a; if (c) { return false; } else { x = f; } return x == a; }
    boolean s9(Boolean a) { Boolean x; return (x = f) == a; }
    boolean s10(Boolean a) { Boolean x = f; return f == x; }
}
