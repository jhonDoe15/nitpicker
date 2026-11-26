package p;
import java.util.*;
import java.util.function.*;
public class Y {
    int count; final Object lock = new Object(); static final Object L = new Object();
    // constructors
    Y() { synchronized (lock) { lock.notify(); } }
    Y(int a) { this(); }
    Y(String s) { super(); synchronized (lock) { lock.notify(); } }
    { synchronized (lock) { lock.notifyAll(); } }
    static { synchronized (L) { L.notify(); } }
    Runnable f1 = () -> { synchronized (lock) { lock.notify(); } };
    Runnable f2 = new Runnable() { public void run() { synchronized (lock) { lock.notify(); } } };
    Object f3 = new Object() { synchronized void m() { notify(); } };
    public synchronized void l1() { Runnable r = () -> { synchronized (lock) { lock.notify(); } }; }
    public synchronized void l2() { Runnable r = () -> { count++; }; notify(); }
    public synchronized void l3() { Runnable r = () -> notify(); notify(); }
    public synchronized void l4(int k) { Runnable r = () -> System.out.println(k); notify(); }
    public synchronized void l5() { Runnable r = this::l5; notify(); }
    public synchronized void l6() { Supplier<Integer> s = () -> count; notify(); }
    public synchronized void l7() { class Loc { } notify(); }
    public synchronized void l8() { class Loc { } new Loc(); notify(); }
    public synchronized void l9() { Object o = new Object() { }; notify(); }
    public void l10() { Runnable r = () -> { synchronized (L) { L.notify(); } }; r.run(); }
    public void l11() { new Thread() { public synchronized void run() { notify(); } }; }
    public void l12() { class Loc { synchronized void m() { notify(); } } }
    enum E { A { synchronized void m() { notify(); } }, B; synchronized void n() { notify(); } void o() { synchronized (this) { notify(); } } }
    record R(int a) { synchronized void m() { notify(); } void n() { synchronized (this) { notifyAll(); } } }
    interface I { default void d(Object o) { synchronized (o) { o.notify(); } } static void s(Object o) { synchronized (o) { o.notifyAll(); } } }
    static class S { static synchronized void sm() { S.class.notify(); } }
    @SuppressWarnings("x") public synchronized void a1() { notify(); }
    @SuppressFBWarnings("NN_NAKED_NOTIFY") public synchronized void a2() { notify(); }
    @SuppressWarnings("all") public synchronized void a3() { notify(); }
    public void n1(Object o, Object q) { synchronized (o) { synchronized (q) { q.notify(); } } }
    public void n2(Object o) { synchronized (o) { o.notify(); } }
    public synchronized void n3(Object o) { synchronized (o) { o.notify(); } }
    public synchronized void n4() { synchronized (lock) { synchronized (L) { L.notify(); } } }
    public void n5() { synchronized (lock) { lock.notify(); } }
    public void n6() { synchronized (lock) { ; lock.notify(); ; } }
    public void n7(boolean b) { synchronized (b ? lock : L) { notify(); } }
    public void n8() { synchronized (this) { this.notify(); } }
    public void n9() { synchronized (Y.this) { Y.this.notify(); } }
    public void n10() throws Exception { synchronized (lock) { lock.wait(); } }
    public void n11() { Y y = this; synchronized (y) { y.notify(); } }
    public void n12() { synchronized (lock) { ((Object) lock).notify(); } }
    public void n13() { synchronized (lock) { lock.notify(); } finally1(); }
    void finally1() {}
    public int n14(int x) { synchronized (lock) { lock.notify(); } return x; }
    public int n15() { synchronized (lock) { lock.notify(); } return 5; }
    public void n16(String s) { synchronized (s) { s.notify(); } }
    public void n17(Y y) { synchronized (y.lock) { y.lock.notify(); } }
    public void n18() { synchronized (lock) { Y.this.lock.notify(); } }
    public void n19() { synchronized (lock) { lock.notify(); lock.notify(); } }
    public void n20() { synchronized (lock) { if (count > 0) lock.notify(); } }
}
