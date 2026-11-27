package p;
import static java.lang.Boolean.TRUE;
import static java.lang.Boolean.FALSE;
import java.util.*;
public class A {
    static class Box<T> { T value; T get() { return value; } }
    static class BB extends Box<Boolean> { boolean m(Boolean a) { return value == a; } boolean m2(Boolean a) { return get() == a; } }
    boolean s1(Boolean a) { return a == TRUE; }
    boolean s2(Boolean a) { return FALSE != a; }
    boolean g1(Box<Boolean> b, Boolean a) { return b.value == a; }
    boolean g2(Box<Boolean> b, Boolean a) { return b.get() == a; }
    boolean v1(Boolean a) { var x = Boolean.valueOf(true); return x == a; }
    boolean v2(Boolean a) { for (Boolean x : List.of(true)) { if (x == a) return true; } return false; }
    boolean v3(Object o, Boolean a) { if (o instanceof Boolean x) { return x == a; } return false; }
    boolean v4(Boolean[] arr, Boolean a) { return arr[0] == a; }
    boolean v5(Boolean a) { Boolean[] arr = {a}; return arr[0] == a; }
    boolean v6(Boolean a, Object o) { Boolean x = (Boolean) o; return x == a; }
    boolean v7(Boolean a) { boolean p = true; return a == (Boolean) p; }
    boolean v8(Boolean a) { return a == (Boolean) true; }
    boolean v9(Boolean a) { return a == (true ? Boolean.TRUE : null); }
    boolean w1(Boolean a, Comparable<Boolean> c) { return c == a; }
    boolean w2(Boolean a, java.io.Serializable c) { return (Object) c == a; }
    boolean w3(Boolean a) { Object o = a; return o == a; }
    boolean w4(Boolean a) { Object o = a; Object p = Boolean.TRUE; return o == p; }
    boolean w5(Boolean a, boolean c) { Object o = c ? a : "x"; return o == a; }
    boolean w6(Boolean a, boolean c) { Object o = a; if (c) o = "x"; return o == a; }
    boolean w7(Boolean a, boolean c) { Object o = a; o = "x"; return o == a; }
    boolean w8(Boolean a, Boolean b) { return a.equals(b) || a == b; }
}
