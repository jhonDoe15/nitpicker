package p;

public class F {
    private final Object f;
    private Object g;
    protected final Object h;

    F(Object f, Object h) { this.f = f; this.h = h; }

    void touch() { g = null; }
    static String show(Object o) { return String.valueOf(o); }

    int a1() {
        if (f == null) {
            touch();
        }
        return f.hashCode();
    }

    int a2() {
        if (g == null) {
            touch();
        }
        return g.hashCode();
    }

    int a3() {
        if (f == null) {
            show(this);
        }
        return f.hashCode();
    }


    int a5() {
        if (h == null) {
            synchronized (this) {
                touch();
            }
        }
        return h.hashCode();
    }

    int a6() {
        if (f == null) {
            new StringBuilder().append(this);
        }
        return f.hashCode();
    }
}
