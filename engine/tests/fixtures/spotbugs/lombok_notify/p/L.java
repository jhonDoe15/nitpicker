package p;
import lombok.Synchronized;
public class L {
    private final Object lock = new Object();
    private int count;
    @Synchronized
    public void a() {
        notify();
    }
    @Synchronized
    public void b() {
        count++;
        notify();
    }
    @Synchronized
    public static void c() {
        L.class.hashCode();
    }
    @Synchronized("lock")
    public void d() {
        lock.notify();
    }
    @Synchronized
    public void e() {
        lock.notifyAll();
    }
    @Synchronized
    public void f(boolean x) {
        if (x) {
            return;
        }
        notify();
    }
    @lombok.Synchronized
    public synchronized void g() {
        int z = 1;
        notify();
    }
}
