package p;
import java.util.concurrent.locks.ReentrantLock;
public class A extends q.Base {
    ReentrantLock own = new ReentrantLock();
    void a() { synchronized (plk) { System.out.println(1); } }
    void b() { prot = null; prot.length(); }
    void c() { synchronized (own) { } synchronized (this.own) { } }
    void d() { own = null; own.lock(); this.own = null; this.own.lock(); }
    class In extends ReentrantLock {
        In() { synchronized (A.this) { System.out.println(2); } synchronized (this) { System.out.println(3); } }
        In(int x) { this(); synchronized (A.this) { System.out.println(4); } }
        class In2 { In2() { synchronized (In.this) { System.out.println(5); } } }
    }
    void m() { class Loc { Loc() { synchronized (own) { } } } }
}
