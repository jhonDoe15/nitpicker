package p;
import java.io.Serializable;
public class A {
    Boolean f;
    static Boolean sf;
    static Boolean g() { return Boolean.TRUE; }
    Boolean h(int x) { return null; }
    boolean m1(Boolean a) { return f == a; }
    boolean m2() { return f == Boolean.TRUE; }
    boolean m3() { return g() == Boolean.TRUE; }
    boolean m4(Boolean a) { return g() == a; }
    boolean m5(Boolean a) { return a == g(); }
    boolean m6(Boolean a, Boolean b, boolean c) { return (c ? a : b) == f; }
    boolean m7(Boolean a, boolean c) { return a == (c ? f : sf); }
    boolean m8(Boolean a, Serializable s) { return a == s; }
    boolean m9(Boolean a, Comparable<Boolean> s) { return a == s; }
    boolean m10(Object o) { return Boolean.TRUE == o; }
    boolean m12(Boolean a) { return h(1) == a; }
    boolean m13(Boolean[] arr) { return arr[0] == arr[1]; }
    boolean m14(Boolean a) { Boolean l = a; return l == f; }
    boolean m15(A o) { return o.f == f; }
    boolean m16(Boolean a) { return sf == a; }
    boolean m17(Boolean a) { return a == sf; }
    boolean m18(Boolean a, Boolean b) { boolean r = a == b; return r; }
    static boolean m19(Boolean a, Boolean b) { return a == b; }
}
