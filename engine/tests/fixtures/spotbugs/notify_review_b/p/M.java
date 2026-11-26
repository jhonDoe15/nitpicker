package p;
import java.util.*;
import java.util.function.*;
public class M {
    static Object SL = new Object();
    class In {}
    static void m01() { Runnable r = () -> { synchronized (SL) { Object o = new Object() {}; SL.notify(); } }; }
    static void m02() { Runnable r = () -> { synchronized (SL) { class Q {} Object o = new Q(); SL.notify(); } }; }
    void m03() { Runnable r = () -> { synchronized (SL) { Object o = new Object() {}; SL.notify(); } }; }
    static void m04() { Runnable r = () -> { synchronized (SL) { Object o = new M().new In(); SL.notify(); } }; }
    static Runnable F = () -> { synchronized (SL) { Object o = new Object() {}; SL.notify(); } };
    Runnable g = () -> { synchronized (SL) { Object o = new Object() {}; SL.notify(); } };
    static { Runnable r = () -> { synchronized (SL) { Object o = new Object() {}; SL.notify(); } }; }
    static void m05(Object p) { Runnable r = () -> { synchronized (p) { Object o = new Object() {}; p.notify(); } }; }
}
interface IF {
    Object LL = new Object();
    default void d1() { synchronized (LL) { LL.notify(); } }
    default void d2() { synchronized (this) { Object o = LL; notify(); } }
    static void s1() { synchronized (LL) { LL.notify(); } }
    static void s2() { synchronized (LL) { Object o = new Object() {}; LL.notify(); } }
}
enum EN {
    A { void f() { synchronized (this) { this.notify(); } } };
    void f() {}
    Object lock = new Object();
    void g() { synchronized (lock) { lock.notify(); } }
    void h() { synchronized (this) { this.notify(); } }
    void i() { synchronized (A) { A.notify(); } }
}
record R(int a) {
    R { synchronized (this) { notify(); } }
    void f() { synchronized (this) { notify(); } }
}
