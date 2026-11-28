package u;
import java.util.List;
public class C {
    static void use(Object o) {}
    static Object make() { return ""; }
    void a(Object o) { if (o instanceof List) { List<?> t = (List<?>) o; if (t != null) use(t); } }
    void b(Object x) { if (x != null) { Object y = x; if (y != null) use(""); else use("z"); } }
    void c() { Object m = null; try { m = make(); if (m == null) return; use(m); } finally { if (m != null) use(m); } }
    void d(Object x) { if (x == null) { Object y = x; use(y); } }
    void e() { Object m = null; try { m = make(); if (m == null) { use(m); return; } } finally { use(""); } }
}
