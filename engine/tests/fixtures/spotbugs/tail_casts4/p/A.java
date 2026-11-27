package p;
public class A {
    static final int SC = Integer.parseInt("4");
    static final int K = 6;
    final int fi = 3;
    double a(int x) { final int c = 4; return Math.ceil(c); }
    double b(int x) { final int c = x; return Math.ceil(c); }
    double c(int x) { final int c = 4; return (double) (c / 2); }
    double d(int x) { final int c = 4; return c / 2; }
    double e(int x) { return Math.ceil(fi); }
    double f(int x) { return Math.ceil(SC); }
    double g(int x) { return Math.ceil(K + 1); }
    double h(int x) { return Math.ceil(K / 2); }
    double i(int x) { return K / 2; }
    double j(int x) { int c = 4; return Math.ceil(c); }
    long k(int x) { final int c = 4; return Math.round(c); }
    double m(int x) { return Math.ceil((char) 65); }
    double n(int x) { return Math.ceil(x > 0 ? 1 : 2); }
    double o(int x) { return Math.ceil(x > 0 ? x : 2); }
    double q(int x) { return Math.ceil(x > 0 ? 2 : x); }
    double r(int x) { return Math.ceil(x > 0 ? K : x); }
    double s(int x) { return Math.ceil(x > 0 ? x : K); }
    double t(int x, int y) { return 1 + x / y + 0.5; }
    double u(int x, int y) { return x + y / x; }
    double v(int x, int y) { return (x / y) + 0.5f; }
    double w(int x, int y) { return Math.ceil(x / y / 2); }
    double z(int x, int y) { return Math.round(x / y / 2f); }
    long z2(int x, int y) { return Math.round(x / y); }
    double z3(int x, int y) { return Math.ceil(x / y) ; }
}
