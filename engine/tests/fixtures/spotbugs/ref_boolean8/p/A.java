package p;
import java.util.*;
import java.util.function.*;
public class A {
    Boolean f;
    static Boolean sf;
    boolean i1 = f == sf;
    static boolean s1 = sf == Boolean.valueOf(true);
    boolean i2 = f == sf, i3 = sf != f;
    static { boolean z = sf == Boolean.FALSE; }
    { boolean z = f == sf; }
    A() { boolean q = f == sf; }
    A(Boolean a) { this(); boolean q = a == f; }
    class In {
        Boolean g;
        boolean k = g == f;
        In(Boolean b) { boolean q = b == g; }
        boolean m(Boolean b) { return b == f; }
    }
    static class SN { Boolean h; boolean m(Boolean b) { return b == h; } boolean w = h == sf; }
    interface I { default boolean d(Boolean a, Boolean b) { return a == b; } Function<Boolean,Boolean> F = x -> x == Boolean.TRUE ? x : null; }
    enum E { X { boolean t(Boolean a, Boolean b) { return a == b; } }, Y; boolean u(Boolean a) { return a == Boolean.FALSE; } Boolean z; boolean v = z == Boolean.TRUE; }
    void anon(Boolean a) {
        Object o = new Object() { Boolean w; boolean x = w == a; boolean y(Boolean c) { return c == a; } };
        Supplier<Supplier<Boolean>> s = () -> () -> a == f;
        Runnable r = () -> { Runnable r2 = () -> System.out.println(a == sf); r2.run(); };
        Function<Boolean,Boolean> g = (Boolean q) -> q == a ? q : a;
        class Loc { boolean m(Boolean b) { return b == a; } Boolean ff; boolean n = ff == a; }
    }
    int sw(Boolean a, Boolean b) {
        switch (a == b ? 1 : 2) { case 1: return b != a ? 3 : 4; default: return 0; }
    }
    boolean multi(Boolean a, Boolean b) {
        System.out.println(
            "x");
        boolean r = a
            == b
            || b
            != a;
        return r;
    }
    boolean two(Boolean a, Boolean b, Boolean c) { return a == b || a == c || c == b || b == a; }
    boolean tern(Boolean a, Boolean b) {
        return b.hashCode() > 0
            ? a == b
            : b == a;
    }
}
