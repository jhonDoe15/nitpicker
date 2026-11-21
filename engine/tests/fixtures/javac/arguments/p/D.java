package p;
import java.util.*;
import java.util.function.*;
import java.util.stream.*;
public class D {
    void take(Object a, Object b) {}
    <T> T id(T t) { return t; }
    <T, R> void fs(Function<T, R> f, Supplier<T> s) {}
    <T, R> void sf(Supplier<T> s, Function<T, R> f) {}
    static class Box<T> { Box(T t) {} Box(T t, Object o) {} }
    void m1() {
        take((new Object() { int a1; }), new Object() { int a2; });
        take(hashCode() > 1 ? new Object() { int b1; } : new Object() { int b2; }, new Object() { int b3; });
        take(this.<Object>id(new Object() { int c1; }), new Object() { int c2; });
        take(new Box<>(new Object() { int d1; }), new Object() { int d2; });
        take(new Box<Object>(new Object() { int e1; }), new Object() { int e2; });
        Stream.of(1).collect(Collectors.toMap(x -> new Object() { int h1; }, x -> new Object() { int h2; }));
        take(new Object[] { new Object() { int i1; } }, new Object() { int i2; });
        take("" + id(new Object() { int j1; }), new Object() { int j2; });
        take(id(new Object() { int k1; }).toString(), new Object() { int k2; });
        take(switch (hashCode()) { default -> new Object() { int l1; }; }, new Object() { int l2; });
        take((Object) id(new Object() { int n1; }), new Object() { int n2; });
        take(id(new Object() { int o1; }) == null, new Object() { int o2; });
        take(new Box<Object>(id(new Object() { int q1; }), new Object() { int q2; }) { int q3; }, new Object() { int q4; });
        take(this.id(new Object() { int s1; }), new Object() { int s2; });
        take(super.equals(new Object() { int t1; }), new Object() { int t2; });
        take(Optional.of(1).map(x -> new Object() { int u1; }), new Object() { int u2; });
        take(!equals(new Object() { int w1; }), new Object() { int w2; });
        take(id((Object) new Object() { int x1; }) instanceof String, (new Object() { int x2; }).hashCode() + 1);
    }
}
