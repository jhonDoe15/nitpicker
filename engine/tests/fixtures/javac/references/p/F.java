package p;
import java.util.*;
import java.util.function.*;
public class F extends q.P {
    private void priv() {} private static void spriv() {} static void refs(String... xs) {} static void refs2(int a, String... xs) {}
    static class V { V(String... xs) {} V(int a, List<String> l) {} }
    static class G<T> { G(T t, List<T> ts) {} }
    class In { In(int z) {} }
    interface Fn3 { void f(String a, String b, String c); }
    void m(String s, int n, List<String> ls) {
        Runnable a = this::priv; Runnable b = F::spriv; Runnable c = this::prot; Runnable d = F::sprot; Runnable e = super::pub;
        Consumer<String[]> f = F::refs; Consumer<String> g = F::refs; Runnable h = F::refs; Fn3 i = F::refs; BiConsumer<Integer, String[]> j = F::refs2;
        Object o1 = new V("a", "b") { String t = s; };
        Object o2 = new V() { int t = n; };
        Object o3 = new V(n, ls) { };
        Object o4 = new G<String>(s, ls) { };
        Object o5 = new G<>(s, ls) { };
        Object o6 = new In(3) { String t = s; };
        Object o7 = new q.P(n) { };
        Runnable r1 = () -> { Runnable x = this::priv; Runnable y = F::spriv; Runnable z = this::prot; };
        Object o8 = new Object() { Runnable x = F.this::priv; Runnable y = F::spriv; Runnable z = F.this::prot; Runnable w = F::sprot; Runnable v = F.this::pub; };
        enum LE { A(() -> {}); LE(Runnable r) {} }
    }
    static void sm(String s) { Object o = new Object() { String t = s; }; Object p = new V("x") { }; }
    static class N { void nm(F f) { Runnable x = f::priv; Runnable y = F::spriv; Runnable z = f::pub; } }
    F() { this(new Object() { }); } F(Object o) { super(); }
    static Object sf = new Object() { }; Object inf = new Object() { };
}
