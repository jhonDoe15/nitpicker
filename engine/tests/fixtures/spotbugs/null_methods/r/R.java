package r;
import java.util.Objects;
public class R {
    @edu.umd.cs.findbugs.annotations.CheckForNull static Object maybe() { return null; }
    static void req(Object o) { Objects.requireNonNull(o); }
    static void req2(Object o) { Objects.requireNonNull(o, "m"); o.hashCode(); }
    static Object req3(Object o) { return Objects.requireNonNull(o); }
    void a() { Objects.requireNonNull(maybe()); }
    void b() { Object x = maybe(); Objects.requireNonNull(x); x.hashCode(); }
    void c() { req(maybe()); }
    void d() { req2(maybe()); }
    void e() { req3(maybe()); }
    void f(Object x) { if (x == null) { req3(x); } }
    void g(Object x) { if (x != null) return; Objects.requireNonNull(x, "q"); }
}
