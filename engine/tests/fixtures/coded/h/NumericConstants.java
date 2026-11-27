package h;
class NumericConstants {
    static final int N = 2;
    static final String X = (1 > 0) ? "a" : "b";
    static final String Y = N == 2 ? "a" : "b";
    static final String Z = 'c' > 98L ? "a" : "b";
    static final String W = 1.5f < 1 ? "b" : "a";
    static final String V = (byte) 300 == 44 ? "a" : "b";
    static final String U = Integer.MAX_VALUE + 1 < 0 ? "a" : "b";
    static final String S = Long.MAX_VALUE > 0 && N != 3 ? "a" : "b";
    static final String Q = (~N << 2) <= -12 ? "a" : "b";
    static final String P = Double.NaN != Double.NaN ? "a" : "b";
    static final String L = "PMD.UnusedLocalVariable";
    static final String M = N * 3 >= 6 ? L : "x";
    boolean m(String x) {
        return x.equals(X) || x.equals(Y) || x.equals(Z) || x.equals(W) || x.equals(V) || x.equals(U);
    }
    boolean n(String x) {
        return x.equals(NumericConstants.S) || x.equals(Q) || x.equals(P);
    }
    @SuppressWarnings(1 > 0 ? "PMD.UnusedLocalVariable" : "y") void f() { int tmp = 1; }
    @SuppressWarnings(M) void g() { int tmp = 1; }
}
