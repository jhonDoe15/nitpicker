package p;
public class S {
    static int sc;
    static final String STR = "x";
    private final Object lock = new Object();
    static Object getLock() {
        return null;
    }
    public synchronized void m1() {
        sc = 1;
        notify();
    }
    public synchronized void m2() {
        Runnable r = () -> {};
        notify();
    }
    public synchronized void m3() {
        new Object().hashCode();
        notify();
    }
    public synchronized void m4() {
        getLock().hashCode();
        notify();
    }
    public synchronized void m5() {
        System.nanoTime();
        notify();
    }
    public synchronized void m6() {
        new Object();
        notify();
    }
    public synchronized void m7() {
        getLock().notify();
        notify();
    }
    public synchronized void m8() {
        try {
            notify();
        } finally {
        }
    }
    public synchronized void m9() {
        while (true) {
            notify();
            break;
        }
    }
    public synchronized void n1() {
        STR.notify();
    }
    public void n2() {
        synchronized (lock) {
            synchronized (this) {
                notify();
            }
            sc = 2;
        }
    }
    public void n3() {
        for (int i = 0; i < 3; i++) {
            synchronized (lock) {
                lock.notify();
                break;
            }
        }
    }
    public void n4() {
        for (int i = 0; i < 3; i++) {
            synchronized (lock) {
                lock.notify();
                continue;
            }
        }
    }
    public synchronized void n5() {
        Object a = new Object[2];
        notify();
    }
    public synchronized void n6() {
        int[] a = {1, 2};
        notify();
    }
    public synchronized void n7() {
        Runnable r = new Runnable() {
            public void run() {
            }
        };
        notify();
    }
    public static synchronized void n8() {
        Runnable r = new Runnable() {
            public void run() {
            }
        };
        S.class.hashCode();
    }
    public synchronized void n9() {
        sc++;
        notify();
    }
    public synchronized void o1() {
        long v = 1L;
        v++;
        notify();
    }
    public synchronized void o2() {
        int x = 1;
        x += 2;
        notify();
    }
    public synchronized void o3() {
        notify();
        ;
        return;
    }
    public synchronized void o4() {
        {
            notify();
        }
    }
    public synchronized void o5() {
        label:
        notify();
    }
    public synchronized void o6() {
        if (false) {
            sc = 1;
        }
        notify();
    }
    public synchronized void o7() {
        Integer i = 5;
        notify();
    }
    public synchronized void o8() {
        Object o = (Object) "s";
        notify();
    }
    public synchronized void o9() {
        String s = String.valueOf(1) + "";
        notify();
    }
}
