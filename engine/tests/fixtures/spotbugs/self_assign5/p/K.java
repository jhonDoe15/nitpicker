package p;
import java.util.function.IntConsumer;
public class K {
    int f; static int sf; int q;
    { int t = 1; t = t; use(t); }
    int fv = 2;
    K() { int a = 1; a = a; use(a); }
    K(int a) { a = 5; a = a; use(a); a = a; use(a); }
    K(long a) { this(); a++; a = a; use(a); }
    static { int sf = 3; sf = sf; use(sf); }
    static void s1() { int sf = 0; sf = sf; use(sf); }
    static void s2(int f) { f = f; use(f); }
    void m1(Object o) { if (o instanceof String s) { s = s; use(s); } }
    void m2(Object o) { switch (o) { case Integer i -> { i = i; use(i); } default -> { } } }
    void m3(int b) { b += 'a'; b = b; use(b); }
    void m4(int b) { b += (short) 1; b = b; use(b); }
    void m5(int b) { b -= -32768; b = b; use(b); }
    void m6(int b) { b += 0x10; b = b; use(b); }
    void m7(int b) { int c = b = b; use(c); }
    void m8(int a) { for (;; a = a) { break; } use(a); }
    void m9() { try { use(1); } catch (RuntimeException e) { e = e; use(e); } }
    void m10() { IntConsumer c = f -> { f = f; use(f); toString(); }; c.accept(1); }
    void m11() { IntConsumer c = f -> { f = f; use(f); new In(); }; c.accept(1); }
    void m12() { IntConsumer c = f -> { f = f; use(f); }; c.accept(1); }
    class In { }
    static void use(Object o) {}
    static void use(int o) {}
    static void use(long o) {}
}
