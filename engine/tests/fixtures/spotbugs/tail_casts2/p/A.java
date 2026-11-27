package p;

public class A {
    static final int C = 7;
    double d;
    double a(int x) { return (double) (C / 2); }
    double b() { return Math.ceil(5); }
    double c() { return Math.ceil(C); }
    double e(int x, int y) { return x % y; }
    double f(int x, int y) { return (x / y) * 1.0; }
    boolean g(int x, int y) { return x / y > 0.5; }
    double h(boolean c, int x, int y) { return c ? x / y : 1.0; }
    void i(int x, int y) { d += x / y; }
    void j(int x, int y) { d = x / y; }
    Double k(int x, int y) { return (double) (x / y); }
    double m(int x) { return StrictMath.ceil(x); }
    long n(int x) { return StrictMath.round(x); }
    long o(int x) { return Math.round((double) x); }
    double q(char c, int y) { return c / y; }
    double r(int x, int y) { return Math.ceil(x / y) + Math.ceil(x); }
    double s(int x, int y) { return (double) (x / y) + (double) (y / x); }
    float t(int x, int y) { return x / y; }
    double u(long x, int y) { return x / y; }
    double v(Integer x, int y) { return x / y; }
    double w(int x, int y) { return Math.ceil((long) x); }
    double x(int x, int y) { return Math.abs(x / y); }
    double y(int x, int y) { use(x / y); return 0; }
    void use(double v) { }
    double z(int x, int y) { return (double) -(x / y); }
}
