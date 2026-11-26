package p;
import java.util.function.*;
public class A {
    @interface SuppressFBWarnings { String[] value() default {}; String justification() default ""; }
    public int a, b, c, d, e, f, g;
    public static int s1, s2, s3, s4;
    public int h;
    public A() { Runnable r = () -> a = 1; }
    static { Runnable r = () -> s1 = 1; }
    void m1() {
        int x = foo(1,
            2) + b;
        b = 
          foo(3,
            4);
    }
    void m2() { switch (c) { case 1: c = 2; break; default: c = 3; } }
    void m3() { try { d = 1; } finally { d = 2; } }
    void m4() { Supplier<Integer> s = () -> { e = 3; return e; }; }
    void m5() { f = bar(
          1); }
    void m6() { g = h = 3; }
    int foo(int x, int y) { return x; }
    int bar(int x) { return x; }
    @SuppressFBWarnings("PA_PUBLIC_PRIMITIVE_ATTRIBUTE") public int sup;
    @SuppressFBWarnings(value="PA_PUBLIC_PRIMITIVE_ATTRIBUTE", justification="x") public int sup2;
    @SuppressFBWarnings public int sup3;
    @SuppressFBWarnings("MS_SHOULD_BE_FINAL") public static int sup4 = 1;
    public int sup5; 
    void m7() { sup = 1; sup2 = 1; sup3 = 1; sup5 = 2; sup4 = 2; }
    public static void u() { int q = s2 + s3 + s4 + sup4; s2 = 1; }
}
