package printed.captures;
import java.io.*; import java.util.*; import java.util.function.*;
public class G01 {
    static class Res implements AutoCloseable { public void close() {} }
    static class Box2<T> { T get() { return null; } }
    static class SubR<U extends Res> extends Box2<U> {}
    static class SubC<U extends Closeable> extends Box2<U> { }
    static class SubM<U extends Closeable, V> extends Box2<V> { }
    static class Pair<A extends Closeable, B> { A a() { return null; } B b() { return null; } }
    interface P<T> { T get(); }
    interface PR<U extends Res> extends P<U> {}
    static class Cmp<T extends Comparable<T> & Closeable> { T get() { return null; } }
    static class Arr<T extends Closeable> { T[] arr() { return null; } List<T> list() { return null; } T get() { return null; } }

void a(SubR<? super Res> s) { var c = s.get(); }
}
