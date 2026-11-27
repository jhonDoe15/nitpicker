package p;
import java.util.*;
public class A {
    Boolean f, g;
    static Boolean s() { return null; }
    boolean m1(B b) { return b.flag == f; }
    boolean m2() { return f == g; }
    boolean m3(Boolean a) { return Objects.requireNonNull(a) == f; }
    boolean m4(Boolean a, Map<String, Boolean> m) { return m.get("x") == a; }
    boolean m5(B b) { return b.flag == Boolean.FALSE; }
    boolean m6(Boolean a) { Runnable r = new Runnable() { public void run() { System.out.println(a == f); } }; return true; }
    boolean m7(Boolean a) { Boolean l = a; l = f; return l == g; }
    boolean m8(Boolean a, Boolean b) {
        return s()
            == a;
    }
    boolean m9(Boolean a, Boolean b) {
        return a == b
            && s() == b;
    }
    boolean m10(Object o, Object p) { return o == p; }
    boolean m11(Boolean a) { return B.SF == a; }
    boolean m12(B b) { return b.get() == f; }
    boolean m13(Boolean a) { return a == s() || a != s(); }
}
class B { Boolean flag; static Boolean SF; Boolean get() { return flag; } }
