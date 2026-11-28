package p;
import java.util.*;
import java.util.function.*;
public class K {
    Object lock = new Object();
    int cnt;
    static void sm(Object p) {}
    void k01(Object p) { synchronized (p) { Supplier<Object> r = () -> p; p.notify(); } }
    void k02(Object p) { synchronized (p) { Function<Object,Object> r = x -> x; p.notify(); } }
    void k03(Object p) { synchronized (p) { Runnable r = () -> { List<String> l = new ArrayList<>(); for (String s : l) { s.length(); } }; p.notify(); } }
    void k04(Object p) { synchronized (p) { Predicate<Object> r = o -> o instanceof String s && s.isEmpty(); p.notify(); } }
    void k05(Object p) { synchronized (p) { Runnable r = () -> { final int k = 3; int y = k; }; p.notify(); } }
    void k06(Object p) { final int k = 3; synchronized (p) { Runnable r = () -> { int y = k; }; p.notify(); } }
    void k07(Object p) { final String k = "s"; synchronized (p) { Runnable r = () -> { String y = k; }; p.notify(); } }
    void k08(Object p) { final int k = Integer.parseInt("3"); synchronized (p) { Runnable r = () -> { int y = k; }; p.notify(); } }
    void k09(Object p) { synchronized (p) { Runnable r = () -> { try (java.io.StringReader sr = new java.io.StringReader("")) { sr.close(); } }; p.notify(); } }
    void k10(Object p) { synchronized (p) { Runnable r = () -> { switch (3) { case 1 -> {} default -> {} } }; p.notify(); } }
    void k11(Object p) { synchronized (p) { Runnable r = () -> { int[] a = {1}; for (int v : a) { sm(v); } }; p.notify(); } }
    void k12(Object p) { synchronized (p) { Runnable r = () -> { int a = 1; { int b = a; } }; p.notify(); } }
    void k13(Object p) { synchronized (p) { Runnable r = () -> { Object o = p == null ? 1 : 2; }; p.notify(); } }
    void k14(Object p) { synchronized (p) { Consumer<Object> r = (Object q) -> q.hashCode(); p.notify(); } }
    void k15(Object p) { synchronized (p) { BiConsumer<Object,Object> r = (q, w) -> { q.hashCode(); w.hashCode(); }; p.notify(); } }
    void k16(Object p) { synchronized (p) { Runnable r = () -> { Object lock = null; Object x = lock; }; p.notify(); } }
    void k17(Object p) { synchronized (p) { Runnable r = () -> { sm(cnt()); }; p.notify(); } }
    int cnt() { return 1; }
    void k18(Object p) { synchronized (p) { Runnable r = () -> { sm(String.valueOf(1)); }; p.notify(); } }
    void k19(Object p) { synchronized (p) { Runnable r = () -> { Object o = K.this; }; p.notify(); } }
    void k20(Object p) { synchronized (p) { Runnable r = () -> { Object o = lock.getClass(); }; p.notify(); } }
    void k21(Object p) { synchronized (p) { Runnable r = () -> { cnt = 1; }; p.notify(); } }
    void k22(Object p) { synchronized (p) { Runnable r = () -> { cnt++; }; p.notify(); } }
    void k23(Object p) { synchronized (p) { Runnable r = () -> { K.this.cnt = 1; }; p.notify(); } }
    void k24(Object p) { synchronized (p) { Runnable r = () -> { int cnt = 1; cnt = 2; }; p.notify(); } }
}
