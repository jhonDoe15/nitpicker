package p;
import java.util.*;
import java.util.function.*;
public class C {
    C() {} C(Object a) {} C(Object a, Object b) {} C(Supplier<Object> a, Object b) {} C(Runnable r, Object b) {}
    void take(Object a, Object b) {} void take(Supplier<Object> a, Object b) {}
    void take2(Function<String, Object> a, Object b) {}
    static void run(Runnable r) {} static Object runO(Runnable r) { return null; }
    <T> T id(T t) { return t; }
    <T> T sup(Supplier<T> t) { return t.get(); }
    <T> void gen(T a, T b) {}
    static Object so1 = new Object() { int f01; }; static Runnable sr = () -> { new Object() { int f02; }; };
    Object o1 = new Object() { int f03; Object in = new Object() { int f03i; }; };
    void m1() {
        Runnable r = () -> { Object a = new Object() { int a1; }; Runnable q = () -> { Object b = new Object() { int a2; }; }; Object c = new Object() { int a3; }; };
        Object t = hashCode() > 1 ? new Object() { int b1; } : sup(() -> new Object() { int b2; });
        take2(x -> { return new Object() { int c1; }; }, id(new Object() { int c2; }));
        Object sw = switch (hashCode()) { case 1 -> new Object() { int d1; }; default -> sup(() -> new Object() { int d2; }); };
        new Thread(() -> { new Object() { int e1; }; }) { int e2; }.start();
        sup(() -> sup(() -> new Object() { int g1; })); Object z = new Object() { int g2; };
        take(sup(() -> new Object() { int h1; }), new Object() { int h2; });
        take(runO(() -> { new Object() { int i1; }; }), new Object() { int i2; });
        new C(new Object() { int j1; }) { int j2; };
        new C(() -> new Object() { int k1; }, new Object() { int k2; }) { int k3; };
        new C(() -> new Object() { int l1; }, new Object() { int l2; });
        gen(new Object() { int m1; }, sup(() -> new Object() { int m2; }));
        take(hashCode() > 1 ? () -> new Object() { int n1; } : null, new Object() { int n2; });
        take((() -> new Object() { int o1; }), new Object() { int o2; });
        take((Supplier<Object>) () -> new Object() { int p1; }, new Object() { int p2; });
        run(() -> run(() -> { new Object() { int q1; }; })); 
        take2(x -> sup(() -> new Object() { int r1; }), new Object() { int r2; });
        Object v = id(id(new Object() { int s1; })); 
        take(new ArrayList<>() { int t1; }, new Object() { int t2; });
        List<Object> lo = id(new ArrayList<>() { int u1; }); Object u = new Object() { int u2; };
        Arrays.asList(1, 2).stream().map(x -> (Object) new Object() { int v1; }).filter(y -> new Object() { int v2; } != null).forEach(z2 -> { new Object() { int v3; }; });
        Arrays.asList(1, 2).forEach(w -> take(() -> new Object() { int w1; }, new Object() { int w2; }));
        Supplier<Supplier<Object>> ss = () -> () -> new Object() { int x1; }; var vv = new Object() { int x2; };
        Comparator<String> cmp = Comparator.comparing(s -> new Object() { int y1; }.toString() + new Object() { int y2; });
    }
    C(int x) { this(() -> { new Object() { int z1; }; }, new Object() { int z2; }); }
    enum E { A(new Object() { int en1; }) { int en2; }, B(() -> new Object() { int en3; }) { int en4; }; E(Object o) {} E(Supplier<Object> s) {} Object f = new Object() { int en5; }; }
    static class Base { Base(Object o) {} }
    static class Der extends Base { Der() { super(new Object() { int su1; }); } Der(int x) { super((Runnable) () -> { new Object() { int su2; }; }); } }
    @SuppressWarnings("x") void local() { class L1 { Object o = new Object() { int lo1; }; } Object an = new Object() { int lo2; class M { Object mo = new Object() { int lo3; }; } }; class L1b {} { class L1c {} } class L2 {} }
    void local2() { class L1 { } class L2 {} Object an = new Object() { int lo4; }; }
}
