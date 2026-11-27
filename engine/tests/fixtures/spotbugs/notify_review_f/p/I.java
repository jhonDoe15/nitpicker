package p;
import java.util.*;
import java.util.function.*;
public class I {
    static Object SL = new Object(); Object lock = new Object();
    static int cnt() { return 1; }
    static synchronized void s01() { Supplier<Object> s = () -> { int z = cnt(); class Q { int g() { return z; } } return new Q(); }; SL.notify(); }
    static synchronized void s02() { Supplier<Object> s = () -> { int z = cnt(); class Q { int g() { return z; } } Supplier<Q> t = Q::new; return t; }; SL.notify(); }
    static synchronized void s03() { Function<Integer, Object> s = z -> { class Q { int g() { return z; } } return new Q(); }; SL.notify(); }
    static synchronized void s04() { Function<Integer, Object> s = z -> { class Q { int g() { return z; } } Supplier<Q> t = Q::new; return t; }; SL.notify(); }
    static synchronized void s05() { Function<Integer, Object> s = z -> { class Q { int g() { return z; } } class R extends Q { } return new R(); }; SL.notify(); }
    static synchronized void s06() { Function<Integer, Object> s = z -> new Object() { int g() { return z; } }; SL.notify(); }
    static synchronized void s07() { Function<Integer, Object> s = z -> { class Q { int g() { return z; } } return new Q() { }; }; SL.notify(); }
    static synchronized void s08() { class Q { int g() { return cnt(); } } Object o = new Q(); SL.notify(); }
    static synchronized void s09() { int z = cnt(); class Q { int g() { return z; } } Object o = new Q(); SL.notify(); }
    static synchronized void s10() { int z = cnt(); class Q { int g() { return z; } } Object o = new Object() { Object x = new Q(); }; SL.notify(); }
    static synchronized void s11() { int z = cnt(); class Q { int g() { return z; } } Runnable o = () -> { Object x = new Q(); }; SL.notify(); }
    static synchronized void s12() { int z = cnt(); class Q { int g() { return z; } } Runnable o = () -> { Supplier<Q> x = Q::new; }; SL.notify(); }
    static synchronized void s13() { int z = cnt(); class Q { int g() { return z; } } class R { Object x = new Q(); } Object o = new R(); SL.notify(); }
    static synchronized void s14() { int z = cnt(); class Q { int g() { return z; } } class R { Object x = new Q(); } Supplier<R> o = R::new; SL.notify(); }
    static synchronized void s15() { int z = cnt(); class Q { int g() { return z; } } class R extends Q { } Object o = new R() { }; SL.notify(); }
    static synchronized void s16() { int z = cnt(); class Q { int g() { return z; } } class R extends Q { } Object o = (Supplier<R>) R::new; SL.notify(); }
    static synchronized void s17() { int z = cnt(); class Q { int g() { return z; } } Object o = (Supplier<Q>) Q::new; SL.notify(); }

    static synchronized void s19() { int z = cnt(); class Q { Q() { } Q(int a) { this(); } int g() { return z; } } Object o = new Q(1); SL.notify(); }

    static synchronized void s21() { class Q { Q() { class In { } new In(); } } Supplier<Q> t = Q::new; SL.notify(); }
    static synchronized void s22() { int z = cnt(); class Q { Q() { class In { int g() { return z; } } new In(); } } Supplier<Q> t = Q::new; SL.notify(); }
    static synchronized void s23() { int z = cnt(); class Q { class In { int g() { return z; } } } Object o = new Q(); SL.notify(); }
    static synchronized void s24() { int z = cnt(); class Q { class In { int g() { return z; } } } Supplier<Q> o = Q::new; SL.notify(); }
    static synchronized void s25() { int z = cnt(); class Q { Object o = new Object() { int g() { return z; } }; } Supplier<Q> t = Q::new; SL.notify(); }
    static synchronized void s26() { int z = cnt(); class Q { Supplier<Integer> o = () -> z; } Object t = new Q(); SL.notify(); }
    static synchronized void s28() { int z = cnt(); class Q { static int k; static void m() { } } Object t = new Q(); SL.notify(); }
    static synchronized void s29() { class Q { static int k; Q() { } } Supplier<Q> t = Q::new; SL.notify(); }
}
