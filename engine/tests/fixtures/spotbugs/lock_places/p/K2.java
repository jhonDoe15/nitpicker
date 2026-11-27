package p;
import java.util.concurrent.locks.ReentrantLock;
public class K2 extends ReentrantLock {
    class In extends ReentrantLock {
        class In2 {
            void x() { synchronized (K2.this) { System.out.println(1); } }
            void y() { synchronized (In.this) { System.out.println(2); } }
        }
        void z() { Runnable r = () -> { synchronized (K2.this) { System.out.println(3); } }; r.run(); }
        void w() { synchronized (In.this) { System.out.println(4); } }
    }
    void v() { class Loc { void u() { synchronized (K2.this) { System.out.println(5); } } } }
}
