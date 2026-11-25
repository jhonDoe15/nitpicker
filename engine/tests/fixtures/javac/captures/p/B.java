package p;
import java.util.*;
import java.util.function.*;
public class B {
    void take(Object a, Object b) {} void take(Supplier<Object> a, Object b) {} void take(Object a, Supplier<Object> b) {}
    void take2(Function<String, Object> a, Object b) {}
    <T> T id(T t) { return t; }
    <T> T sup(Supplier<T> t) { return t.get(); }
    void order() {
        take(() -> new Object() { int l12; },
             new Object() { int l13; });
        take(new Object() { int l14; },
             () -> new Object() { int l15; });
        take2(x -> new Object() { int l16; },
             new Object() { int l17; });
        take2((String x) -> new Object() { int l18; },
             new Object() { int l19; });
        Object o = id(sup(() -> new Object() { int l20; })); Object p = new Object() { int l20b; };
        Runnable r = () -> { Object a = new Object() { int l21; }; Runnable q = () -> { Object b = new Object() { int l21b; }; }; Object c = new Object() { int l21c; }; };
        Object t = true ? new Object() { int l22; } : sup(() -> new Object() { int l22b; });
        List<Object> list = new ArrayList<>() { int l23; };
        take2(x -> { return new Object() { int l24; }; }, id(new Object() { int l25; }));
        Object sw = switch (hashCode()) { case 1 -> new Object() { int l26; }; default -> sup(() -> new Object() { int l26b; }); };
        new Thread(() -> { new Object() { int l27; }; }) { int l27b; }.start();
        sup(() -> sup(() -> new Object() { int l28; })); Object z = new Object() { int l28b; };
    }
    void caps(String p, int q) {
        final int K = 5; final String KS = "k"; int eff = 6; String s = p + "x"; long big = 1L; Object o = p;
        Runnable a = () -> System.out.println(K + KS + eff);
        Runnable b = () -> { Object an = new Object() { String t() { return s + q; } }; System.out.println(big); };
        Runnable c = () -> { System.out.println(big); Object an = new Object() { String t() { return s + q; } }; };
        class Loc { long v = big; String w() { return s; } }
        Runnable d = () -> { System.out.println(q); new Loc(); System.out.println(p); };
        Supplier<Loc> e = Loc::new;
        Runnable f = () -> { if (o instanceof String str) { Runnable g = () -> System.out.println(str + eff); } };
        if (o instanceof String outer) { Runnable h = () -> System.out.println(outer + p); }
        for (String it : List.of(p)) { Runnable i = () -> System.out.println(it); }
        try { } catch (RuntimeException ex) { Runnable j = () -> System.out.println(ex); }
        Function<String, Runnable> k = x -> () -> System.out.println(x + q + p);
        Runnable l = () -> { int inner = q; Runnable m = () -> System.out.println(inner + eff); };
        Runnable n = () -> System.out.println(this.toString() + p + p + q);
        var v = new ArrayList<String>(); Runnable w = () -> v.add(s);
        Object anon = new Object() { Runnable inAnon = () -> System.out.println(p + q); void am(int ap) { Runnable r = () -> System.out.println(ap + s); } };
    }
    static <T extends Number & Comparable<T>, U> void gens(T t, U u, List<? extends T> lt, T[] ta) {
        Runnable r = () -> System.out.println("" + t + u + lt + ta);
    }
    static void refs(String... xs) {}
    static class Sup { void sm() {} protected void pm() {} }
    static class Sub extends Sup {
        void go(int[] arr, List<String> ls) {
            Runnable a = super::sm; Supplier<int[]> b = arr::clone; Function<Integer, String[]> c = String[]::new;
            Consumer<String> d = B::refs; Function<String, Integer> e = String::length; Runnable f = this::sm;
            class L2 { L2(int x) {} } Function<Integer, L2> g = L2::new; Supplier<Inner> h = Inner::new;
            Supplier<Sub> i = Sub::new; BiFunction<String, String, Boolean> j = String::equals; Function<String, Integer> k = ls::indexOf;
        }
        class Inner {}
    }
    void local() {
        class L3 { Runnable a = () -> {}; static Runnable sa = () -> {}; L3() { Runnable c = () -> {}; } void m() { Runnable d = () -> {}; } { Runnable e = () -> {}; } static { Runnable f = () -> {}; } }
        record LR(int x) { static Runnable s = () -> {}; LR { Runnable c = () -> {}; } }
        enum LE { A; Runnable r = () -> {}; }
        interface LI { Runnable r = () -> {}; }
        Object an = new Object() { Runnable a = () -> { Runnable n = () -> {}; }; { Runnable e = () -> {}; } class M { Runnable ma = () -> {}; } };
        Runnable same1 = () -> System.out.println("same"); Runnable same2 = () -> System.out.println("same");
    }
}
