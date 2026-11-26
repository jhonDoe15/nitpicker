package p;
public class Q {
    private int count;
    private final Object lock = new Object();
    private static final Object LOCK = new Object();
    private Q other;
    public synchronized void d1() {
        int y = Integer.parseInt("1");
        notify();
    }
    public synchronized void d2() {
        Object o = LOCK;
        notify();
    }
    public synchronized void d3() {
        Object o = lock;
        notify();
    }
    public void d4() {
        synchronized (lock) {
            Object o = lock;
            o.notify();
        }
    }
    public synchronized void d5(boolean b) {
        if (b) {
        }
        notify();
    }
    public synchronized void d6() {
        notify();
        int x = 1;
    }
    public synchronized void d7() {
        notify();
        System.nanoTime();
    }
    public synchronized void d8() {
        super.hashCode();
        notify();
    }
    public synchronized void d9() {
        this.hashCode();
        notify();
    }
    public synchronized void e1(Runnable r) {
        r.run();
        notify();
    }
    public synchronized void e2() {
        int c = other.count;
        notify();
    }
    public synchronized int e3() {
        notify();
        return 1;
    }
    public synchronized void e4(int x) {
        int a = x + 1;
        notify();
    }
    public synchronized void e5(Object o) {
        String s = (String) o;
        notify();
    }
    public synchronized void e6(Object o) {
        boolean s = o instanceof String;
        notify();
    }
    public static synchronized void e7() {
        LOCK.notify();
    }
    public void e8() {
        synchronized (lock) {
            lock.notify();
        }
        synchronized (lock) {
            lock.notifyAll();
        }
    }
    public synchronized void e9() {
        Runnable r = () -> {
            synchronized (lock) {
                lock.notify();
            }
        };
        r.run();
    }
    public synchronized void f1() {
        try {
            notify();
        } catch (RuntimeException e) {
        }
    }
    public synchronized void f2(String a) {
        String s = "x" + a;
        notify();
    }
    public synchronized void f3(int x) {
        switch (x) {
            case 1:
                break;
            default:
        }
        notify();
    }
    public void f4() {
        synchronized (this) {
            notify();
            int z = 2;
        }
    }
    public void f5(boolean b) {
        if (b) {
            synchronized (lock) {
                lock.notify();
            }
        }
    }
    public void f6() {
        for (int i = 0; i < 2; i++) {
            synchronized (lock) {
                lock.notify();
            }
        }
    }
    public synchronized void f7() {
        Object o = this;
        o.notify();
    }
    public void f8(Q q) {
        synchronized (q.lock) {
            q.lock.notify();
        }
    }
    public void f9() {
        synchronized (other) {
            other.notify();
        }
    }
    public void g1() throws InterruptedException {
        synchronized (lock) {
            lock.notify();
            lock.wait();
        }
    }
}
