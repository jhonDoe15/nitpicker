package p;
public class N {
    private int count;
    private final Object lock = new Object();
    private volatile boolean flag;
    public synchronized void a() {
        notify();
    }
    public synchronized void b() {
        count++;
        notify();
    }
    public void c() {
        synchronized (lock) {
            lock.notifyAll();
        }
    }
    public void d() {
        synchronized (lock) {
            flag = true;
            lock.notifyAll();
        }
    }
    public synchronized void e() {
        System.out.println("x");
        notifyAll();
    }
    public synchronized void f(int[] xs) {
        xs[0] = 1;
        notifyAll();
    }
    public void g() {
        synchronized (this) {
            this.notify();
        }
    }
    public synchronized void h() {
        helper();
        notify();
    }
    private void helper() {
        count = 2;
    }
    public synchronized void i() {
        notify();
        count = 3;
    }
    public void j(Object o) {
        synchronized (o) {
            o.notify();
        }
    }
    public static synchronized void k() {
        N.class.notify();
    }
}
