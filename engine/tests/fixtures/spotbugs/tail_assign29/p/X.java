package p;
import java.util.*;
public class X<T> {
    int f; int g = f; T t; List<T> lt; X<T> other; X<?> w;
    { f = f; }
    { int v = f; g = 1; f = v; }
    X() { this(1); f = f; }
    X(int a) { f = f; }
    X(String s) { super(); f = f; { g = g; } }
    X(long q) { int v = f; this.f = v; }
    void gen() { t = t; lt = lt; this.t = this.t; other.t = other.t; other = other; w = w; }
    void gen2(X<T> o) { o.t = o.t; o.other = o.other; o.w = o.w; }
    static class B { int bf; String bs; void bm() { bf = bf; } }
    static class C extends B { void cm() { bf = bf; this.bf = this.bf; super.bf = super.bf; bs = bs; } void cm2(C c, B b) { c.bf = c.bf; b.bf = b.bf; } }
    static class D extends C { void dm() { bf = bf; super.bf = super.bf; ((B) this).bf = ((B) this).bf; } }
    record R(int a, int b) { R { a = a; } void m() { } static int s; R(int a) { this(a, 1); } }
    enum E { A { void m() { x = x; } }, B; int x; void m() { x = x; } E() { x = x; } }
    interface I { int K = 1; default void d() { } }
    class In { int ix; void m() { ix = ix; f = f; X.this.f = X.this.f; g = X.this.g; } class In2 { int jx; void m() { jx = jx; f = f; ix = ix; In.this.ix = In.this.ix; } } }
    static void sm(X<String> x) { x.f = x.f; x.t = x.t; }
    void anon() { new Object() { int af; { af = af; f = f; } void m() { af = af; this.af = this.af; f = f; } }; }
    void anon2() { Runnable r = new Runnable() { int af; public void run() { af = af; } }; }
    void nestl() { Runnable r = () -> { Runnable q = () -> { f = f; }; f = f; }; }
    void nestl2() { java.util.function.Supplier<Runnable> r = () -> () -> { f = f; }; }
    void lam3(int f) { Runnable r = () -> { this.f = this.f; }; }
    void loc() { class L { int lf; void m() { lf = lf; f = f; } } }
    void shadow(X x) { X y = x; y.f = y.f; y = this; y.f = y.f; }
    void alias() { X y = this; y.f = f; f = y.f; y.f = y.f; }
    void alias2(X y) { int v = y.f; y = other; y.f = v; }
    void alias3(X y, X z) { int v = y.f; z.f = v; }
    void alias4(X y) { X z = y; int v = y.f; z.f = v; }
    void alias5(X y) { X z = y; z.f = y.f; }
    void alias6(X y) { X z = y; y = null; z.f = z.f; }
    void alias7(X y) { int v = y.f; y = new X(); y.f = v; }
    void alias8(boolean b, X y) { X z = b ? this : y; z.f = z.f; }
    void alias9(boolean b, X y) { X z = b ? y : y; z.f = y.f; }
    void post(X x) { x.f = x.f++; this.f = this.f++; f = (f++); f = x.f++; }
    void pre(X x) { x.f = ++x.f; }
    void incr() { int v = f; f++; f = v; }
    void incr2() { int v = f; this.g++; f = v; }
    void incr3() { f++; f = f; }
    void incr4(X x) { int v = f; x.g += 1; f = v; }
    void incr5() { int v = f; int w = v++; f = v; }
    void incr6() { int v = f; v++; f = v; }
    void incr7() { int v = f; v += 0; f = v; }
    void incr8() { int v = f; v = v; f = v; }
    void dbl() { int a; int b; a = b = 1; a = a = 2; }
    int dbl2(int a) { a = a = 3; return a; }
    void dbl3(int a) { a = (a = 3); a = (a) = 4; a = a = a = 5; }
    void dbl4(long a) { a = a = 3; }
    void dbl5() { int x = 0; x = x = 1; { int x2 = 0; x2 = x2 = 1; } }
    void dbl6(int a) { Runnable r = () -> { int z = 1; z = z = 2; }; }
    void dbl7() { int a = 0, b = 0; a = a = 1; b = b = 1; a = a = 1; }
    void dbl8(int a, double d, float fl) { fl = fl = 1; d = d = 1; }
    void dbl9(boolean b) { b = b = true; }
    void dbl10(String s) { s = s = "a"; }
    void dbl11(int[] a) { a[0] = a[0] = 1; int i = 0; i = i = i; }
}
