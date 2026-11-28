package h;
class Constants {
    static final String UL = "PMD.UnusedLocalVariable";
    static final String UL2 = UL;
    static final String P = "PMD";
    static final String R = P + ".UnusedLocalVariable";
    static final String T = true ? "PMD.UnusedLocalVariable" : "x";
    static final boolean B = false;
    static final String TB = B ? "x" : "PMD.UnusedLocalVariable";
    static final String OTHER = ConstantsOther.Z;
    @SuppressWarnings(UL2) void f() { int tmp = 1; }
    @SuppressWarnings(R) void f2() { int tmp = 1; }
    @SuppressWarnings(T) void f3() { int tmp = 1; }
    @SuppressWarnings(TB) void f4() { int tmp = 1; }
    @SuppressWarnings(OTHER) void f5() { int tmp = 1; }
    @SuppressWarnings(ConstantsShared.C) void f6() { int tmp = 1; }
    @SuppressWarnings(true ? "PMD.T1" : "PMD.T2") void g() { }
    @SuppressWarnings(!B ? "PMD.UnusedLocalVariable" : "x") void g2() { int tmp = 1; }
}
class ConstantsMixed {
    static String f() { return "z"; }
    static final boolean FL = true;
    static final String S = true ? "a" : f();
    static final String N = true ? "a" : null;
    static final String U = FL & true ? "a" : "b";
    static final String Q = FL == true ? "a" : "b";
    boolean m(String x) { return x.equals(S) || x.equals(N) || x.equals(U) || x.equals(Q); }
}
class ConstantsOther { static final String Z = Constants.UL2; }
interface ConstantsShared { String A = "PMD."; String C = A + "UnusedLocalVariable"; }
