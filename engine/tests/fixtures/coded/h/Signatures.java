package h;
import java.util.*;
import java.util.function.*;
public class Signatures<E> extends ArrayList<E> {
    Signatures(Collection<E> c, Comparator<E> k, Predicate<E> f, Consumer<E> g) {
        addAll(c);
        sort(k);
        removeIf(f);
        forEach(g);
        gm(null, null);
        n(1);
    }
    public <U extends Comparable<U>> void gm(U u, List<? extends U> l, U... more) {}
    public <Q extends Integer> void n(Q q) {}
    static class Gen<T> { class GI {} }
}
class SignaturesIn<T extends Number> {
    class Deep {
        Deep() { d(null); }
        public void d(T t) {}
    }
}
class SignaturesBound<T extends Number> {
    SignaturesBound() { n(null); }
    public <Q extends T> void n(Q q) {}
}
class SignaturesSerial implements java.io.Serializable {
    Signatures.Gen<String>.GI gi;
    SignaturesIn<Integer>.Deep deep;
}
class SignaturesPlain {
    SignaturesPlain(Integer i) {
        g(null);
        h(null, null);
        w(1);
        a3(1);
        a4(null);
        a7(null);
        a1(null);
        a2(i);
        a6(i);
    }
    public <U extends Comparable<U>> void g(U u) {}
    public <K, V extends List<? extends K>> void h(Map<K, ? super V> m, V... vs) {}
    public <A extends Number & Comparable<A>> void w(A a) {}
    public <A extends Number & Comparable<A>> void a3(A a) {}
    public void a3(String a) {}
    public <A extends Comparable<A>> void a4(A a) {}
    public <A extends Number & java.io.Serializable> void a7(A a) {}
    public <A extends Number & Comparable<A>> void a1(A a) {}
    public <A extends Number & Comparable<A>> void a2(A a) {}
    public void a2(Object a) {}
    public <A extends Comparable<A>> void a6(A a) {}
    public void a6(Object a) {}
    class In<T> { class In2 { In2() { k(null, null); } public void k(T t, Map.Entry<T, ? super T> e) {} } }
}
class SignaturesIntersection<T extends Number & Comparable<T>> {
    SignaturesIntersection() { f(null); }
    public void f(T t) {}
}
class SignaturesWild<T extends Comparable<? super T>> {
    SignaturesWild() { f(null); addAll(null); }
    public void f(T t) {}
    public void addAll(Collection<? extends T> c) {}
}
class SignaturesOuter<T> {
    SignaturesOuter() { c(null); d(null); e(null); a(null); f(null); }
    class In {}
    public void c(In i) {}
    public void d(In[] i) {}
    public void e(List<In> i) {}
    public void a(@Deprecated String s) {}
    public void f(java.util.@Deprecated List<String> x) {}
}
class SignaturesOuterSerial<T> implements java.io.Serializable {
    class In {}
    class In2<Q> {}
    In f1;
    In2<String> f2;
}
class SignaturesMarks<T> {
    @interface NoTarget {}
    @java.lang.annotation.Target(java.lang.annotation.ElementType.PARAMETER) @interface Param {}
    @java.lang.annotation.Target(java.lang.annotation.ElementType.TYPE_USE) @interface Use {}
    @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME) @interface Run {}
    @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME) @java.lang.annotation.Target(java.lang.annotation.ElementType.PARAMETER) @interface RunParam {}
    SignaturesMarks() { a(null); b(null); c(null); d(null); e(null); f(null); g(null); h(null); i(null); }
    public void a(@Deprecated String s) {}
    public void b(@SuppressWarnings("x") String s) {}
    public void c(@NoTarget String s) {}
    public void d(@Param String s) {}
    public void e(@Use String s) {}
    public void f(@Run String s) {}
    public void g(@RunParam String s) {}
    public void h(@Missing String s) {}
    public void i(@java.lang.Deprecated String s) {}
}
