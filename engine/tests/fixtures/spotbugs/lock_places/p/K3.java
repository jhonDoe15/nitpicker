package p;
import java.util.concurrent.locks.ReentrantLock;
class Holder { ReentrantLock lk = new ReentrantLock(); static ReentrantLock SLK = new ReentrantLock(); }
public class K3 {
    void a(Holder h) { synchronized (h.lk) { System.out.println(1); } }
    void b() { synchronized (Holder.SLK) { System.out.println(2); } }
}
