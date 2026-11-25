package p;
import java.io.IOException;
import java.util.function.Supplier;
public class H {
    static int risky(int x) throws IOException { if (x > 3) throw new IOException(); return x; }
    static int safe(int x) { return x; }
    static class Base { Base() {} Base(int a) throws IOException { risky(a); } Base(String s) {} }
    interface Face { int go(); }
    Object field(int p) throws IOException {
        return new Base("s") {
            private final int v = risky(p);
        };
    }
    Object block(int p) {
        return new Base() {
            int w;
            { if (p > 2) { throw new IllegalStateException("x"); } w = p; }
        };
    }
    Object face(int p) throws IOException {
        return new Face() {
            int v = risky(p);
            public int go() { return v; }
        };
    }
    Object caught(int p) {
        return new Base() {
            int v;
            { try { v = risky(p); } catch (IOException e) { v = 0; } }
        };
    }
    static Object inStatic(int p) throws IOException {
        return new Base() {
            int v = risky(p);
        };
    }
    Object superThrows(int p) throws IOException {
        return new Base(p) {
            int v = safe(p);
        };
    }
    Object quiet(int p) {
        return new Base() {
            int v = safe(p);
            int m() throws IOException { return risky(v); }
        };
    }
    Supplier<Object> inLambda(int p) {
        return () -> new Base() {
            { if (p > 1) throw new IllegalArgumentException(); }
        };
    }
    Object local(int p, String q) throws IOException {
        class Loc extends Base {
            int v = risky(p);
            Loc(int z) throws IOException { if (z > q.length()) throw new IOException(); }
        }
        class Loc2 { int v = E.risky2() + p; }
        return new Loc(1);
    }
    Object nested(int p) {
        return new Base() {
            Object in() throws IOException {
                int k = p + 1;
                return new Base() {
                    int v = risky(k + p);
                };
            }
        };
    }
    enum E {
        A { int v = risky2(); },
        B;
        static int risky2() { if (System.nanoTime() > 5) throw new IllegalStateException(); return 1; }
    }
    class Inner {
        Inner(int p) throws IOException {
            Object o = new Base() {
                int v = risky(p);
            };
        }
    }
    Object selfCall(int p) {
        return new Base() {
            int v = own();
            int own() { if (p > 1) throw new IllegalStateException(); return 1; }
        };
    }
    Object assertion(int p) {
        return new Base() {
            { assert p > 0; }
        };
    }
    Object finalizer(int p) throws IOException {
        return new Base() {
            int v = risky(p);
            @Override protected final void finalize() {}
        };
    }
}
