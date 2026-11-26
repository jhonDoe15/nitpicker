package p;
public class M {
    private int count;
    private final Object lock = new Object();
    private static final Object LOCK = new Object();
    private boolean flag;
    public synchronized void a1() {
        int x = 1;
        notify();
    }
    public synchronized void a2(boolean b) {
        if (b) {
            notify();
        }
    }
    public synchronized void a3() {
        notify();
        notify();
    }
    public void a4() {
        notify();
    }
    public static void a5() {
        synchronized (LOCK) {
            LOCK.notifyAll();
        }
    }
    public void a6() {
        count++;
        synchronized (lock) {
            lock.notify();
        }
    }
    public void a7() {
        synchronized (lock) {
            lock.notify();
        }
        count++;
    }
    public synchronized void a8() {
        try {
            notify();
        } finally {
            count = 1;
        }
    }
    public synchronized void a9() {
        if (flag) {
            notify();
        }
    }
    public void b1() {
        synchronized (lock) {
            synchronized (this) {
                notify();
            }
        }
    }
    public void b2() {
        synchronized (lock) {
            count = 1;
        }
        synchronized (lock) {
            lock.notify();
        }
    }
    public synchronized void b3() {
        Runnable r = () -> count++;
        notify();
    }
    public synchronized int b4() {
        notify();
        return count;
    }
    public synchronized void b5() {
        wait0();
    }
    private void wait0() {
        notify();
    }
    public void b6() {
        synchronized (lock) {
            int y = count;
            lock.notify();
        }
    }
    public synchronized void b7(Object o) {
        o.notify();
    }
    public synchronized void b8() {
        lock.notify();
    }
    public void b9() {
        synchronized (lock) {
            lock
                .notify();
        }
    }
    public synchronized void c1() {
        long t = System.nanoTime();
        notify();
    }
    public synchronized void c2() {
        Object o = new Object();
        notify();
    }
    public synchronized void c3(int[] a) {
        int v = a[0];
        notify();
    }
    public synchronized void c4() {
        count += 0;
        notify();
    }
    public void c5() {
        synchronized (lock) {
            flag = !flag;
        }
        synchronized (lock) {
            lock.notifyAll();
        }
    }
}
