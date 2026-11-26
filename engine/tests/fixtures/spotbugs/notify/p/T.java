package p;
public class T {
    static final int MAX = 3;
    final int inst = 4;
    static final String STR = "s";
    final Object lock = new Object();
    static boolean ok() {
        return true;
    }
    static T make() {
        return null;
    }
    static class Nested {
    }
    class Inner {
        synchronized void q1() {
            T.this.notify();
        }
        synchronized void q2() {
            notify();
        }
        void q3() {
            synchronized (lock) {
                lock.notify();
            }
        }
    }
    public synchronized void p1() {
        make().lock.notify();
    }
    public synchronized void p2() {
        if (ok()) notify();
    }
    public synchronized void p3() {
        int y = MAX;
        notify();
    }
    public synchronized void p4() {
        int y = inst;
        notify();
    }
    public synchronized void p5() {
        Object o = STR;
        notify();
    }
    public synchronized void p6() {
        int x = 1;
        x = x + 1;
        notify();
    }
    public synchronized void p7() {
        Object n = new Nested();
        notify();
    }
    public synchronized void p8() {
        Object n = new Inner();
        notify();
    }
    public synchronized void p9() {
        java.util.function.IntUnaryOperator f = x -> x + 1;
        notify();
    }
    public synchronized void r1() {
        for (;;) {
            notify();
        }
    }
    public synchronized void r2() {
        boolean b = ok() && ok();
        notify();
    }
    public synchronized void r3() {
        if (ok()) {
            int z = 1;
        }
        notify();
    }
    public synchronized void r4() {
        try {
            int z = 1;
        } catch (RuntimeException e) {
        }
        notify();
    }
    public synchronized void r5() {
        Runnable q = T::make;
        notify();
    }
    public synchronized void r6() {
        Runnable q = this::p1;
        notify();
    }
    public synchronized void r7() {
        String s = "a" + MAX;
        notify();
    }
    public synchronized void r8() {
        int x;
        x = 5;
        notify();
    }
    public synchronized void r9() {
        int[] a = new int[MAX];
        a = null;
        notify();
    }
    Runnable field = () -> {
        synchronized (lock) {
            lock.notify();
        }
    };
    {
        synchronized (lock) {
            lock.notify();
        }
    }
    T() {
    }
    T(int a) {
    }
    public synchronized void s1() {
        new Inner().notify();
    }
    public synchronized void s2(int k) {
        switch (k) {
            default:
                notify();
        }
    }
}
