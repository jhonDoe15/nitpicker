package p;
class Other { Object f; static Object SF; }
public class G {
    Object own;
    void a(Other o) { o.f = null; o.f.hashCode(); }
    void b() { Other.SF = null; Other.SF.hashCode(); }
    void d() { own = null; Object k = own; k.hashCode(); }
    void f(Other o) { o.f = null; Object k = o.f; k.hashCode(); }
    void g() { Runnable r = () -> { Object z = null; z.hashCode(); }; r.run(); }
    G() { Object w = null; w.hashCode(); }
    class In { void h() { own = null; own.hashCode(); } }
    static void i() { Object q = null; synchronized (q) { } }
}
