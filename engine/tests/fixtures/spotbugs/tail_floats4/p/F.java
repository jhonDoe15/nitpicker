package p;

public class F {
    final double fd; final double fc; double n; static final double SF = Math.random(); final double fk;
    Double boxed;
    F(double x, double y) { fd = x; fc = y * 2; fk = Math.random(); }
    boolean a1(double y) { return fd == y; }
    boolean a2() { return fd == n; }
    boolean a3(double y) { return fc == y; }
    boolean a4(double y) { return SF == y; }
    boolean a5(double y) { return fk == y; }
    boolean a6(double y, double z) { return -y == z; }
    boolean a7(double y) { return -n == y; }
    boolean a8(Double x) { return x == n; }
    boolean a9(Double x, Double y) { return x.doubleValue() == y.doubleValue(); }
    boolean a10(double y) { return boxed == y; }
    boolean a11(double y) { return fd == 1.5; }
    boolean a12(F o) { return fc == o.fc; }
    boolean a13(F o) { return fk == o.fk; }
    boolean a14(double y) { return y == Double.MIN_VALUE; }
    boolean a15(double y) { return y == 0.1; }
    boolean a16(double y) { return n == 0.1; }
    boolean a17(double y) { return n * 2 == 0.1; }
    boolean a18(double y) { return y + n == n; }
    boolean a19(double[] a, double y) { return a[0] == y; }
    boolean a20(double[] a) { return a[0] == 1.5; }
    boolean a21(double y) { return Math.sqrt(y) == 1.5; }
    boolean a22(int i) { return i / 2.0 == 1.5; }
    boolean a23(int i) { return i == 1.5; }
    boolean a24(long i, long j) { return (double) i == (double) j; }
    boolean a25(double y) { return y % 2 == y; }
    boolean a26(double y) { double z = y; z++; return z == y; }
    boolean a27(double y) { double z = y; z += 1; return z == y; }
}
