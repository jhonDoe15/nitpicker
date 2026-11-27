package p;

public class A {
    double a(boolean c, int x, int y) { return (double) (c ? x / y : 1); }
    double b(boolean c, int x, int y) { return (double) (c ? 1 : x / y); }
    double c(boolean c, int x, int y) { return Math.ceil(c ? x : y); }
    long d(boolean c, int x, int y) { return Math.round(c ? x : 1); }
    double e(int x, int y) { var r = x / y; return r; }
    double f(int x, int y) { return (double) (x / y) / 2; }
    float g(long x, long y) { return x / y; }
    double h(int x, int y) { return switch (x) { case 1 -> x / y; default -> 2.0; }; }
    double i(int x, int y) { double[] a = new double[] { x / y, 1 }; return a[0]; }
    double j(int x, int y) { return Math.max(x / y, 1.0); }
    double k(int x, int y) { return Math.ceil(x / 2.0); }
    double m(int x) { return Math.ceil(-x); }
    double n(Integer x) { return Math.ceil(x); }
}
