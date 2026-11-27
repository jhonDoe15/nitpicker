package p;
public class A {
    Boolean f;
    static Boolean g() { return Boolean.TRUE; }
    boolean m1(Boolean a, Boolean b) { return a == b; }
    boolean m2(Boolean a) { return a == Boolean.TRUE; }
    boolean m3(Boolean a) { return Boolean.FALSE != a; }
    boolean m4(Boolean a) { return a == null; }
    boolean m5(Boolean a, boolean b) { return a == b; }
    boolean m6() { return f == g(); }
    boolean m7(Object o) { return o == Boolean.TRUE; }
    boolean m8(Boolean a) { if (a == Boolean.valueOf(true)) { return true; } return false; }
    boolean m9(Boolean a, Boolean b) {
        return a
            ==
            b;
    }
    boolean m10(Boolean a) { Runnable r = () -> System.out.println(a == Boolean.TRUE); return true; }
    boolean m11(Boolean a, Boolean b) { boolean x = a == b; boolean y = a != b; return x && y; }
    boolean m12(Boolean a) { return Boolean.TRUE.equals(a) || a == (Boolean) Boolean.TRUE; }
    boolean m13(Integer a, Integer b) { return a == b; }
    <T extends Boolean> boolean m14(T a, T b) { return a == b; }
}
