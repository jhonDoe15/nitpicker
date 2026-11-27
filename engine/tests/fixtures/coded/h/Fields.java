package h.fields;
import static h.fields.Holder.LIMIT;
import static h.fields.Holder.Mode.*;
class A { int f; protected int g; private int h; static int S; }
class B extends A {
    int own;
    void m() { f = 1; g = 2; h = 3; S = 4; this.f = 5; super.g = 6; own = 7; }
    class In { void n() { f = 1; own = 2; } }
    static class SIn extends A { void n(B b) { f = 1; b.own = 2; b.f = 3; } }
}
record R(int k) {
    R { k = k + 1; use(k); }
    R(int k, int j) { this(k); use(k); }
    int get() { return k + this.k; }
    static void use(int i) { }
}
enum E implements I { X { int z() { return v + w; } }; int w; int z() { return v; } }
interface I { int v = 1; }
class G<T extends A> { void m(T t) { t.f = 1; } }
class H { Object o = new A() { void q() { f = 2; h = 3; } }; int f; }
class L {
    int k;
    void m() {
        class Loc extends A { int k; void p(Loc l) { l.k = 1; l.f = 2; k = 3; f = 4; } }
        Runnable r = new Runnable() { int k; public void run() { k = 1; L.this.k = 2; } };
        Object a = new Object() { int q; }.q;
    }
}
class Xu extends Unknown {
    void m() { Yu y = null; int a = y.f; int b = y.g.h; }
}
class Yu { int f; Unknown2 g; }
class Zu { void m(Yu y) { int a = y.f; Object b = y.g.h(); } }
class Holder {
    static final int LIMIT = 3;
    enum Mode { FAST, SLOW }
    int pick(Mode mode) {
        int FAST = 1;
        switch (mode) { case FAST: return LIMIT + FAST; case SLOW: return SLOW.ordinal(); default: return 0; }
    }
    int other(Mode mode) { return mode == FAST ? LIMIT : 0; }
}
