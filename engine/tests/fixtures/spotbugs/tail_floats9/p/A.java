package p;
import java.util.function.*;
public class A {
    double fa; static double sa = 1.0 * Math.random();
    boolean a1(double x) { return x == 0.1 + 0.2; }
    boolean a2(double x) { return x == 2 * 0.5; }
    boolean a3(double x) { return x == 0.3 * 3; }
    boolean a4(double x) { final double c = 0.3; return x == c * 2; }
    boolean a5(double x) { double c = 0.3; return x == c * 2; }
    boolean a6(double x) { int i = 2; return x == i * 0.5; }
    boolean a7(double x) { int i = 2; return x == i; }
    boolean a8(double x, int i) { return x == i * 0.5; }
    boolean a9(double x, int i) { return x == i / 3; }
    boolean b1() { return this.fa == fa; }
    boolean b2() { return A.sa == sa; }
    boolean b3() { return p.A.sa == A.sa; }
    boolean b4(A o) { return o.fa == o.fa; }
    boolean b5(A o) { A q = o; return q.fa == o.fa; }
    boolean b6(double x) { return (x) == x; }
    boolean b7(double x) { return x == (double) x; }
    Supplier<Boolean> c1(double x, double y) { double t = x * y; return () -> t == 0.3; }
    Supplier<Boolean> c2(double x) { double t = x; return () -> t == 0.3; }
    Supplier<Boolean> c3(double x) { return () -> x == 0.3 * 2; }
    Supplier<Boolean> c4(double x) { return () -> fa == 0.3; }
    Runnable c5(double x, double y) { double t = x * y; return new Runnable() { public void run() { boolean b = t == 0.3; } }; }
    Runnable c6(double x) { return new Runnable() { public void run() { boolean b = x == 0.3; boolean c = x == 0.4; } }; }
    Runnable c7(double x) { class L { void run() { boolean b = x == 0.3; } } return new Runnable() { public void run() { new L().run(); } }; }
    Function<Double,Boolean> c8() { return d -> d == 0.3; }
    DoubleFunction<Boolean> c9() { return d -> d == 0.3; }
    DoublePredicate c10() { return d -> d * 2 == 0.3; }
    boolean d1(double x) { return x == (x > 0 ? 0.3 : 0.5); }
    boolean d2(double x, boolean c) { return x == (c ? 0.3 : 1); }
    boolean d3(double x, boolean c) { return x == (c ? 0.3 : 0.0 / 0); }
    boolean d4(double x) { double n = Double.NaN; return n == x; }
    boolean d5(double x) { return x == Double.NaN || x == Double.NaN; }
    boolean d6(double x) { return x == Float.NaN; }
    boolean d7(float x) { return x != Float.NaN; }
    boolean d8(double x) { return x == Double.POSITIVE_INFINITY; }
    boolean d9(double x) { return x == Double.MAX_VALUE; }
}
