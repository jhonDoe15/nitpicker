package p;
public class U {
    final Object lock = new Object();
    static boolean ok() {
        return true;
    }
    public synchronized void u1() {
        if (ok()) {
            notify();
            return;
        }
        int x = 1;
    }
    public synchronized void u2() {
        if (ok()) return;
        notify();
    }
    public synchronized void u4() {
        while (ok()) {
            notify();
        }
    }
    public void u5() {
        synchronized (lock) {
            if (ok()) {
                lock.notify();
                return;
            }
            int x = 1;
        }
    }
    public synchronized void u6() {
        if (ok()) notify();
        else {
            int x = 1;
        }
    }
    public synchronized void u7() {
        do {
            notify();
        } while (ok());
    }
    public synchronized void u8() {
        notify();
        for (;;) {
        }
    }
    public synchronized void u9() {
        try {
            notify();
        } finally {
            System.nanoTime();
        }
    }
    public synchronized void v1() {
        if (ok()) {
            notify();
        } else {
            notify();
        }
    }
    public synchronized void v2() {
        throw new RuntimeException();
    }
    public synchronized void v3() {
        notify();
        throw new RuntimeException();
    }
    public void v4() {
        synchronized (lock) {
            lock.notify();
            throw new RuntimeException();
        }
    }
    public synchronized void v5() {
        if (ok()) {
            notify();
            return;
        }
        notify();
        int y = 2;
    }
    public void v6() {
        synchronized (lock) {
            while (ok()) {
                lock.notify();
            }
        }
    }
}
