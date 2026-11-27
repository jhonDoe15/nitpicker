package p;
import static q.Q.*;
public class A {
    Boolean f;
    static Boolean id(Boolean b) { return b; }
    boolean x1() { return f == sf; }
    boolean x2() { return sf == f; }
    boolean x3() { return mk() == sf; }
    boolean x4() { return sf == mk(); }
    boolean x5(Boolean a) { Boolean x = true; return a == x; }
    boolean x6(Boolean a) { return a == id(true); }
    boolean x7(Boolean a, boolean p) { return a == Boolean.valueOf(p); }
    boolean x8(Boolean a) { return a == (Boolean) false; }
    boolean x9() { return f == SK; }
    enum E { A(null == null ? Boolean.TRUE : null), B(Boolean.valueOf(true)); E(Boolean b) { boolean z = b == Boolean.valueOf(false); } }
}
