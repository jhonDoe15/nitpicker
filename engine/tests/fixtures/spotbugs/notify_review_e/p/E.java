package p;
import java.util.function.*;
interface I2 { }
public class E<T extends Object & I2> {
    static Object SL = new Object();
    Object lock = new Object();
    T t;
    class Inner { }
    static class Nest { }
    synchronized void e01() { Supplier<Inner> s = Inner::new; lock.notify(); }
    synchronized void e02() { Supplier<Nest> s = Nest::new; lock.notify(); }
    static synchronized void e03() { class Q { } Supplier<Q> s = Q::new; SL.notify(); }
    synchronized void e04() { class Q { } Supplier<Q> s = Q::new; lock.notify(); }
    static synchronized void e05(Object p) { class Q { Object g() { return p; } } class R extends Q { } class S extends R { } Object x = new S(); SL.notify(); }
    static synchronized void e06(Object p) { class Q { } class R extends Q { } Object x = new R(); SL.notify(); }
    static synchronized void e07(Object p) { class Q { Object g() { return p; } } Function<Q, Object> f = Q::g; SL.notify(); }
    synchronized void e08() { t.notify(); }
    synchronized void e09() { this.t.notify(); }
    <V extends Object & I2> V make() { return null; }
    synchronized void e10() { this.<T>make().notify(); }
    synchronized void e11(E<T> o) { o.t.notify(); }
    static synchronized void e12() { Supplier<int[]> s = () -> new int[1]; IntFunction<int[]> f = int[]::new; SL.notify(); }
    static synchronized void e13(Object p) { class Q { Object g() { return p; } } Supplier<Object> s = () -> new Q(); SL.notify(); }
    synchronized void e14(T p) { p.notify(); }
    synchronized void e15(I2 p) { p.notify(); }
}
