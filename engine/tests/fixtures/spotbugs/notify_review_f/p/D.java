package p;
import java.util.*;
import java.util.function.*;
public class D {
    Object lock = new Object(); static Object SL = new Object();
    class Inner { class Deep { } }
    static class Nest { class NI { } }
    Supplier<Inner> fi = Inner::new;
    static Supplier<Object> sf = () -> { class Q { } return new Q(); };
    // constructors
    D() { Supplier<Inner> s = Inner::new; synchronized (lock) { lock.notify(); } }
    D(int p) { class Q { int g() { return p; } } Supplier<Q> s = Q::new; lock.notify(); }
    D(long p) { this(1); class Q { int g() { return (int) p; } } Supplier<Q> s = Q::new; synchronized (this) { SL.notify(); } }
    { Supplier<Inner> s = Inner::new; }
    static { class Q { } Supplier<Q> s = Q::new; SL.notify(); }
    void m01() { synchronized (this) { Supplier<Inner> s = Inner::new; SL.notify(); } }
    void m02() { synchronized (this) { Supplier<Nest> s = Nest::new; SL.notify(); } }
    void m06() { synchronized (this) { Object o = new Nest().new NI(); SL.notify(); } }
    void m07() { synchronized (this) { Object o = this.new Inner(); SL.notify(); } }
    static void m08() { synchronized (SL) { Object o = new D().new Inner(); SL.notify(); } }
    static void m09() { synchronized (SL) { class Q { } Supplier<Q> s = Q::new; SL.notify(); } }
    static void m10(int p) { synchronized (SL) { class Q { int g() { return p; } } Supplier<Q> s = Q::new; SL.notify(); } }
    static void m11(int p) { synchronized (SL) { Supplier<Object> s = () -> { class Q { int g() { return p; } } return new Q(); }; SL.notify(); } }
    static void m12(int p) { synchronized (SL) { Supplier<Object> s = () -> { int z = p; class Q { int g() { return z; } } return new Q(); }; SL.notify(); } }
    static void m13(int p) { synchronized (SL) { Supplier<Object> s = () -> { int z = p; class Q { int g() { return z; } } Supplier<Q> t = Q::new; return t; }; SL.notify(); } }
    static void m14(int p) { synchronized (SL) { Supplier<Object> s = () -> { class Q { } return new Q(); }; SL.notify(); } }
    static void m15(int p) { synchronized (SL) { Supplier<Object> s = () -> { class Q { } Supplier<Q> t = Q::new; return t; }; SL.notify(); } }
    void m16(int p) { synchronized (SL) { Supplier<Object> s = () -> { class Q { } return new Q(); }; SL.notify(); } }
    void m17(int p) { synchronized (SL) { Supplier<Object> s = () -> { class Q { } Supplier<Q> t = Q::new; return t; }; SL.notify(); } }
    static void m18(int p) { synchronized (SL) { class Q { int g() { return p; } } Object o = new Q() { int h() { return 1; } }; SL.notify(); } }
    static void m19(int p) { synchronized (SL) { class Q { int g() { return p; } } Object o = new Q() { int h() { return 1; } }; SL.notify(); } }
    static void m20(int p) { synchronized (SL) { class Q { Q(int z) { } int g() { return p; } } Object o = new Q(2) { }; SL.notify(); } }
    static void m21(int p) { synchronized (SL) { class Q { } Object o = new Q() { }; SL.notify(); } }
    static void m22(int p) { synchronized (SL) { class Q { int g() { return p; } } class R extends Q { } Object o = new R() { }; SL.notify(); } }
    static void m23(int p) { synchronized (SL) { Object o = new ArrayList<String>() { int g() { return 1; } }; SL.notify(); } }
    static void m24(int p) { synchronized (SL) { Object o = new Thread() { }; SL.notify(); } }
    static void m25(int p) { synchronized (SL) { Object o = new Nest() { }; SL.notify(); } }
    void m26(int p) { synchronized (SL) { Object o = new Nest() { }; SL.notify(); } }
    void m27(int p) { synchronized (SL) { Object o = new Inner() { }; SL.notify(); } }
    void m28(int p) { synchronized (SL) { Object o = new Inner(); SL.notify(); } }
    void m29(int p) { synchronized (SL) { Object o = new Nest().new NI() { }; SL.notify(); } }
    static void m30(int p) { synchronized (SL) { enum LE { A, B } Object o = LE.A; SL.notify(); } }
    static void m31(int p) { synchronized (SL) { enum LE { A, B } Supplier<LE[]> o = LE::values; SL.notify(); } }
    void m32(int p) { synchronized (SL) { enum LE { A, B } Object o = LE.A; SL.notify(); } }
    void m33(int p) { synchronized (SL) { record LR(int a) { } Function<Integer, LR> o = LR::new; SL.notify(); } }
    void m34(int p) { synchronized (SL) { record LR(int a) { } Object o = new LR(0); SL.notify(); } }
    void m36(int p) { synchronized (SL) { record LR(int a) { } Object o = (Supplier<LR>) () -> new LR(0); SL.notify(); } }
    void m37(int p) { synchronized (SL) { record LR(int a) { LR { new Object(); } } Object o = (Supplier<LR>) () -> new LR(0); SL.notify(); } }
    void m38(int p) { synchronized (SL) { interface LI { } Object o = new LI() { }; SL.notify(); } }
    void m39(int p) { synchronized (SL) { interface LI { } Object o = (LI) null; SL.notify(); } }
    void m40(int p) { synchronized (SL) { class Q { } Object o = new Q[1]; SL.notify(); } }
    void m41(int p) { synchronized (SL) { class Q { } IntFunction<Q[]> o = Q[]::new; SL.notify(); } }
    void m42(int p) { synchronized (SL) { class Q { int g() { return p; } } IntFunction<Q[]> o = Q[]::new; SL.notify(); } }
    static void m43(int p) { synchronized (SL) { class Q { int g() { return p; } } IntFunction<Q[]> o = Q[]::new; SL.notify(); } }
    static void m44(int p) { synchronized (SL) { class Q { int g() { return p; } } Object o = new Q[] { null }; SL.notify(); } }
}
