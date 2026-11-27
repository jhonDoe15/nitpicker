package p;
public class A {
    static Boolean calc() { return Boolean.TRUE; }
    static final Boolean C1 = calc();
    static final Boolean C2 = Boolean.parseBoolean("x") ? Boolean.TRUE : Boolean.FALSE;
    static final Boolean C3;
    static { C3 = Boolean.TRUE; }
    final Boolean i1;
    final Boolean i2 = calc();
    static final Boolean C4 = C1;
    static final Boolean C5 = Boolean.valueOf("x");
    static final Boolean C6 = new Boolean(true);
    A(Boolean b) { i1 = b; }
    boolean m1(Boolean a) { return a == C1; }
    boolean m2(Boolean a) { return a == C2; }
    boolean m3(Boolean a) { return a == C3; }
    boolean m4(Boolean a) { return a == i1; }
    boolean m5(Boolean a) { return a == i2; }
    boolean m6(Boolean a) { return a == C4; }
    boolean m7(Boolean a) { return a == C5; }
    boolean m8(Boolean a) { return a == C6; }
    boolean m9(Boolean a, Boolean b) { return a == b; }
    boolean n1(Boolean a) { return C1 == a; }
    boolean n2(Boolean a) { return C1 == C5; }
    boolean n3(Boolean a) { return Boolean.TRUE == C1; }
    boolean n4(Boolean a) { return C1 == Boolean.TRUE; }
    boolean n5(Boolean a) { return i1 == Boolean.TRUE; }
    boolean n6(Boolean a) { return Boolean.TRUE == i1; }
}
