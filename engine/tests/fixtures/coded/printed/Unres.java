package printed;
import java.util.*;
import org.nowhere.Ghost;
class Unres<T> implements java.io.Serializable {
    class In<Q> {}
    In<Missing> f1;
    Ghost.Inner f2;
    Unres() { a(null); b(null); c(null); d(null); }
    public void a(Ghost.Inner x) {}
    public void b(List<Missing> x) {}
    public void c(In<Ghost.Inner> x) {}
    public void d(List<Pkgish.Foo> x) {}
}
