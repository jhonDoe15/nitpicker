package p;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.ConcurrentHashMap;
public class K extends ReentrantLock {
    void a() { synchronized (this) { System.out.println(1); } }
    void b() { Runnable r = () -> { synchronized (this) { System.out.println(2); } }; r.run(); }
    class In { void c() { synchronized (K.this) { System.out.println(3); } } }
    void d() { Object o = new Object() { void e() { synchronized (K.this) { System.out.println(4); } } }; }
    static class M extends ConcurrentHashMap<String, String> {
        void f() { synchronized (this) { System.out.println(5); } }
        void g() { synchronized ((this)) { System.out.println(6); } }
        void h() { synchronized ((Object) this) { System.out.println(7); } }
    }
}
