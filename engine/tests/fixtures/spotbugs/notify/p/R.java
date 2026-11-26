package p;
public class R<T> {
    private int count;
    private final Object lock = new Object();
    private R other;
    private Object[] arr = new Object[1];
    private T held;
    public synchronized void h1(int x) {
        x++;
        notify();
    }
    public synchronized void h3() {
        other.other.notify();
    }
    public synchronized void h4() {
        arr[0].notify();
    }
    static Object getLock() {
        return null;
    }
    public synchronized void h6() {
        getLock().notify();
    }
    public void h7() {
        synchronized (lock) {
            lock.notify();
            return;
        }
    }
    public synchronized void i1() {
        synchronized (lock) {
            lock.notify();
        }
    }
    public synchronized void i2() {
        "x".notify();
    }
    public synchronized void i3() {
        Object o = null;
        notify();
    }
    public synchronized void i5() {
        assert count == 0;
        notify();
    }
    public void i6() {
        synchronized (R.class) {
            R.class.notify();
        }
    }
    public synchronized void i8() {
        count = 1;
        synchronized (lock) {
            lock.notify();
        }
    }
    public synchronized void i9() {
        synchronized (lock) {
            count = 1;
        }
        notify();
    }
    public synchronized void j1() {
        synchronized (lock) {
            lock.notify();
        }
        count = 1;
    }
    public synchronized void j2(Runnable r) {
        r.notify();
    }
    public synchronized void j3(R q) {
        q.notify();
    }
    public synchronized void j4() {
        super.notify();
    }
    public void j6() {
        synchronized (lock) {
            notify();
        }
    }
    public synchronized void j7() {
        held.notify();
    }
    public R() {
        synchronized (this) {
            notify();
        }
    }
    static {
        synchronized (R.class) {
            Object o = new Object();
            synchronized (o) {
                o.notify();
            }
        }
    }
    public synchronized void k4() {
        Runnable r = () -> notify();
    }
    public synchronized void k5() {
        Runnable r = new Runnable() {
            public synchronized void run() {
                notify();
            }
        };
    }
    public void k6() {
        synchronized (lock) {
            int z = 0;
            lock.notify();
        }
    }
    public synchronized void k7() {
        double d = 2.5;
        String s = "s";
        notify();
    }
    public synchronized void k8() {
        lock.
            notify
            ();
    }
    public synchronized void k9() {
        notify(
        );
    }
    public synchronized void l1() {
        this.lock.notifyAll();
    }
    public synchronized void l2() {
        while (true) {
            notify();
            return;
        }
    }
    public synchronized void l3() {
        notifyAll();
        ;
    }
}
