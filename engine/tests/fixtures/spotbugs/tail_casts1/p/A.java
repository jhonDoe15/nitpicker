package p;

public class A {
    double a(int x, int y) { return (double) (x / y); }
    double b(int x, int y) { return x / y; }
    double c(long x, long y) { return (double) (x / y); }
    double d(int x) { return Math.ceil(x); }
    double e(int x, int y) { return Math.ceil(x / y); }
    long f(int x) { return Math.round(x); }
    int g(int x, int y) { return Math.round(x / y); }
    double h(int x) { return Math.ceil((double) x); }
    double i(long x) { return Math.ceil(x); }
    double j(int x, int y) { return Math.ceil((double) x / y); }
    float k(int x, int y) { return (float) (x / y); }
    double m(int x) { return (double) (x / 2); }
    double n(int x) { double r = x / 3; return r; }
    double o(int x, int y) { return Math.floor(x / y); }
    double q(int x, int y) { return Math.sqrt(x / y); }
    long r(int x, int y) { return Math.round((float) (x / y)); }
    long s(long x) { return Math.round(x); }
    double t(int x, int y) { return Math.ceil((float) x); }
    double u(short x, short y) { return (double) (x / y); }
    double v(int x, int y) { return 1.0 * (x / y); }
    double w(int x, int y) { return Math.ceil(x * y); }
    double x(int x, int y) { return Math.ceil((x + y) / 2); }
    double y(int x, int y) { return Math.ceil(x >> 1); }
    double z(int x, int y) { double[] arr = {x / y}; return arr[0]; }
}
