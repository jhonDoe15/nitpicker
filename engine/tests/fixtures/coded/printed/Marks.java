package printed;
import java.util.*;
import java.lang.annotation.*;
class Marks<T, U> {
    @Target(ElementType.TYPE_USE) @interface Nullable {}
    class In<Q> {}
    class Plain {}
    Marks() { b(null); g(null); h(null); i(null); j(null); k(null); l(null); m(null); n(null); o(null); }
    public void b(@Nullable List<@Nullable String> x) {}
    public void g(@Nullable String @Nullable [] x) {}
    public void h(@Deprecated final Marks<T, U>.In in) {}
    public void i(Marks<T, U>.In<String> in) {}
    public void j(Marks.In in) {}
    public void k(Map<@Nullable String, List<@Nullable ? extends Number>> x) {}
    public void l(String @Nullable [] @Nullable [] x) {}
    public void m(@Nullable Marks<T, U>.@Nullable Plain x) {}
    public void n(In in) {}
    public void o(Marks<T, U>.Plain in) {}
}
