package printed;
import java.util.*;
class Raw<T> implements java.io.Serializable {
    class In<Q> {}
    static class St<Q> {}
    In f1;
    Raw<T>.In f2;
    Raw.In f3;
    In<String> f4;
    St f5;
    List<In> f6;
    In[] f7;
    Raw() { a(null); b(null); c(null); d(null); e(null); }
    public void a(In x) {}
    public void b(List<In> x) {}
    public void c(In[] x) {}
    public void d(St x) {}
    public void e(Raw<String>.In x) {}
}
class Flat implements java.io.Serializable {
    class In<Q> {}
    In f1;
    Flat() { a(null); }
    public void a(In x) {}
}
class Two<A> {
    class Mid<B> { class Low<C> {} }
    Two() { a(null); b(null); }
    public void a(Mid.Low x) {}
    public void b(Mid<String>.Low x) {}
}
