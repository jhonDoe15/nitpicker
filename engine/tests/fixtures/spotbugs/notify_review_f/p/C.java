package p;
import java.util.*;
import java.util.function.*;
public class C<T> {
    Object lock = new Object(); static Object SL = new Object();
    int f; static int sf;
    class Inner { }
    class Inner2 extends Inner { }
    static class Nest { }
    class Gen<X> { }
    record Rec(int a) { }
    enum En { A }
    interface If { }
    // instance contexts
    synchronized void c01() { Supplier<Inner> s = Inner::new; lock.notify(); }
    synchronized void c02() { Supplier<Inner2> s = Inner2::new; lock.notify(); }
    synchronized void c03() { Supplier<Gen<String>> s = Gen<String>::new; lock.notify(); }
    synchronized void c04() { Supplier<Gen<String>> s = Gen::new; lock.notify(); }
    synchronized void c05() { Supplier<Nest> s = Nest::new; lock.notify(); }
    synchronized void c06() { IntFunction<Rec> s = Rec::new; lock.notify(); }
    synchronized void c07() { record LR(int a) { } IntFunction<LR> s = LR::new; lock.notify(); }
    synchronized void c08() { enum LE { A } Supplier<Object> s = () -> LE.A; lock.notify(); }
    synchronized void c09() { interface LI { } LI x = new LI() { }; lock.notify(); }
    synchronized void c10() { record LR(int a) { } Object o = new LR(1); lock.notify(); }
    synchronized void c11() { record LR(int a) { } Object o = new LR(f); lock.notify(); }
    synchronized void c12() { class Q { } Supplier<Q> s = Q::new; lock.notify(); }
    synchronized void c13() { class Q { } Object s = new Q(); lock.notify(); }
    synchronized void c14(int p) { class Q { int g() { return p; } } Supplier<Q> s = Q::new; lock.notify(); }
    synchronized void c15(int p) { class Q { int g() { return p; } } Object s = new Q(); lock.notify(); }
    synchronized void c16(int p) { class Q { int g() { return p; } } class R extends Q { } Supplier<R> s = R::new; lock.notify(); }
    synchronized void c17(int p) { class Q { int g() { return p; } } class R extends Q { } class S extends R { } Supplier<S> s = S::new; lock.notify(); }
    synchronized void c18(int p) { class Q { int g() { return p; } } class R extends Q { } class S extends R { } Object s = new S(); lock.notify(); }
    synchronized void c19(final int p) { class Q { int g() { return p; } } Object s = new Q(); lock.notify(); }
    synchronized void c20() { final int p = 3; class Q { int g() { return p; } } Object s = new Q(); lock.notify(); }
    synchronized void c21() { final int p = 3; class Q { int g() { return p; } } Supplier<Q> s = Q::new; lock.notify(); }
    synchronized void c22() { Runnable r = () -> { class Q { } new Q(); }; lock.notify(); }
    synchronized void c23(int p) { Runnable r = () -> { class Q { int g() { return p; } } new Q(); }; lock.notify(); }
    synchronized void c24(int p) { Runnable r = () -> { class Q { int g() { return p; } } Supplier<Q> s = Q::new; }; lock.notify(); }
    synchronized void c25(int p) { Runnable r = () -> { int z = 1; class Q { int g() { return z; } } new Q(); }; lock.notify(); }
    synchronized void c26(int p) { Runnable r = () -> { int z = 1; class Q { int g() { return z; } } Supplier<Q> s = Q::new; }; lock.notify(); }
    synchronized void c27(int p) { Object o = new Object() { Object x = new Object() { int g() { return p; } }; }; lock.notify(); }
    synchronized void c28(int p) { class Q { int g() { return p; } } Object o = new Object() { Object x = new Q(); }; lock.notify(); }
    synchronized void c29(int p) { class Q { int g() { return p; } } Runnable o = () -> new Q(); lock.notify(); }
    synchronized void c30(int p) { class Q { int g() { return p; } } Runnable o = () -> { Supplier<Q> s = Q::new; }; lock.notify(); }
    synchronized void c31(int p) { class Q { int g() { return p; } } Runnable o = () -> { Supplier<Q> s = null; }; lock.notify(); }
    synchronized void c32(int p) { class Q<Z> { int g() { return p; } } Supplier<Q<String>> s = Q<String>::new; lock.notify(); }
    synchronized void c33(int p) { class Q<Z> { int g() { return p; } } Supplier<Q<String>> s = Q::new; lock.notify(); }
    synchronized void c34(int p) { class Q<Z> { int g() { return p; } } Object s = new Q<String>(); lock.notify(); }
    synchronized void c35(int p) { class Q<Z> { int g() { return p; } } Object s = new Q<>(); lock.notify(); }
    synchronized void c36(int p) { class Q { Q(int z) { } int g() { return p; } } Function<Integer, Q> s = Q::new; lock.notify(); }
    synchronized void c37(int p) { class Q { Q(int z) { } } Function<Integer, Q> s = Q::new; lock.notify(); }
    synchronized void c38(int p) { class Q { Q(int z) { } Q() { this(p); } } Supplier<Q> s = Q::new; lock.notify(); }
    synchronized void c39(int p) { class Q { Q(int z) { } Q() { this(p); } } Object s = new Q(1); lock.notify(); }
    synchronized void c40(int p) { class Q { { int k = p; } } Supplier<Q> s = Q::new; lock.notify(); }
    synchronized void c41(int p) { class Q { int k = p; } Supplier<Q> s = Q::new; lock.notify(); }
    synchronized void c42(int p) { class Q { Supplier<Integer> k = () -> p; } Supplier<Q> s = Q::new; lock.notify(); }
    synchronized void c43(int p) { class Q { int g() { return new Object() { int h() { return p; } }.h(); } } Supplier<Q> s = Q::new; lock.notify(); }
    synchronized void c44(int p) { class Q { class QI { int g() { return p; } } } Supplier<Q> s = Q::new; lock.notify(); }
    synchronized void c45(int p) { class Q { class QI { int g() { return p; } } } Object s = new Q(); lock.notify(); }
    synchronized void c46(int p) { class Q { class QI { int g() { return p; } } } Q q = null; Object s = q.new QI(); lock.notify(); }
    synchronized void c47(int p) { class Q { int g() { return p; } } class R { Object x = new Q(); } Supplier<R> s = R::new; lock.notify(); }
    synchronized void c48(int p) { class Q { int g() { return p; } } class R { Object x() { return new Q(); } } Supplier<R> s = R::new; lock.notify(); }
    synchronized void c49(int p) { class Q { int g() { return p; } } class R { Supplier<Q> x() { return Q::new; } } Supplier<R> s = R::new; lock.notify(); }
    synchronized void c50(int p) { class Q { int g() { return p; } } class R extends Q { R() { super(); } } Supplier<R> s = R::new; lock.notify(); }
    synchronized void c51(int p) { class Q { int g() { return p; } } class R extends Q { R(int z) { } } IntFunction<R> s = R::new; lock.notify(); }
    synchronized void c52(int p) { class Q { int g() { return p; } } Object o = new Q() { }; lock.notify(); }
    synchronized void c53(int p) { class Q { int g() { return p; } } Supplier<Object> o = () -> new Q() { }; lock.notify(); }
    synchronized void c54(int p) { class Q { } class R extends Q { int g() { return p; } } Supplier<Q> o = R::new; lock.notify(); }
    synchronized void c55(int p) { class Q { } class R extends Q { int g() { return p; } } Supplier<Q> o = Q::new; lock.notify(); }
    synchronized void c56(int p) { class Q { void m() { class In { int g() { return p; } } new In(); } } Object o = new Q(); lock.notify(); }
    synchronized void c57(int p) { class Q { void m() { class In { int g() { return p; } } new In(); } } Supplier<Q> o = Q::new; lock.notify(); }
    synchronized void c58(int p) { class Q { void m() { class In { } new In(); } } Supplier<Q> o = Q::new; lock.notify(); }
    synchronized void c59(int p) { class Q { void m() { class In { } new In(); } } Object o = new Q(); lock.notify(); }
    // static contexts
    static synchronized void d02() { class Q { } Supplier<Q> s = Q::new; SL.notify(); }
    static synchronized void d03() { class Q { } Object s = new Q(); SL.notify(); }
    static synchronized void d04(int p) { class Q { int g() { return p; } } Supplier<Q> s = Q::new; SL.notify(); }
    static synchronized void d05(int p) { class Q { int g() { return p; } } Object s = new Q(); SL.notify(); }
    static synchronized void d06(int p) { class Q { int g() { return p; } } class R extends Q { } Supplier<R> s = R::new; SL.notify(); }
    static synchronized void d07(int p) { class Q { int g() { return p; } } class R extends Q { } Object s = new R(); SL.notify(); }
    static synchronized void d08(int p) { class Q { int g() { return p; } } Object o = new Object() { Object x = new Q(); }; SL.notify(); }
    static synchronized void d09(int p) { class Q { int g() { return p; } } Runnable o = () -> new Q(); SL.notify(); }
    static synchronized void d10(int p) { class Q { int g() { return p; } } Runnable o = () -> { Supplier<Q> s = Q::new; }; SL.notify(); }
    static synchronized void d11(int p) { record LR(int a) { } IntFunction<LR> s = LR::new; SL.notify(); }
    static synchronized void d12(int p) { record LR(int a) { } Object o = new LR(p); SL.notify(); }
    static synchronized void d13(int p) { class Q { int g() { return p; } } class R extends Q { } class S extends R { } Supplier<S> s = S::new; SL.notify(); }
    static synchronized void d14() { class Q { class QI { } } Supplier<Q> s = Q::new; SL.notify(); }
    static synchronized void d15() { class Q { class QI { } } Q q = null; Object o = q.new QI(); SL.notify(); }
    static synchronized void d16() { class Q { class QI { } void m() { Supplier<QI> s = QI::new; } } Object o = new Q(); SL.notify(); }
    static synchronized void d17(int p) { class Q<Z> { int g() { return p; } } Supplier<Q<String>> s = Q::new; SL.notify(); }
    static synchronized void d18(int p) { class Q<Z> { int g() { return p; } } Supplier<Q<String>> s = Q<String>::new; SL.notify(); }
    static synchronized void d19(int p) { class Q<Z> { int g() { return p; } } Object o = new Q<>(); SL.notify(); }
    static synchronized void d20(int p) { class Q { int g() { return p; } } Object o = new Q() { }; SL.notify(); }
    static synchronized void d21(int p) { class Q { } class R extends Q { int g() { return p; } } Supplier<Q> o = R::new; SL.notify(); }
    static synchronized void d22(int p) { class Q { } class R extends Q { int g() { return p; } } Supplier<Q> o = Q::new; SL.notify(); }
    static synchronized void d23(int p) { class Q { } class R extends Q { int g() { return p; } } Object o = new R(); SL.notify(); }
    static synchronized void d24(int p) { class Q { } class R extends Q { int g() { return p; } } Object o = (Supplier<Q>) () -> new R(); SL.notify(); }
    static synchronized void d25(int p) { Object o = new Object() { int g() { return p; } }; SL.notify(); }
    static synchronized void d26(int p) { Supplier<Object> o = () -> new Object() { int g() { return p; } }; SL.notify(); }
    static synchronized void d27(int p) { Supplier<Object> o = () -> new Object() { int g() { return 1; } }; SL.notify(); }
    static synchronized void d28(int p) { class Q { int g() { return p; } } Object o = new Object() { Object x = (Supplier<Q>) Q::new; }; SL.notify(); }
}
