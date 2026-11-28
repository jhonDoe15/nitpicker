package p;

import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

public class Screened {
    static class Holder {
        Lock foo = new ReentrantLock();
    }

    static class ByReference {
        int x;
        Supplier<Lock> make = ReentrantLock::new;

        void h(Holder b) {
            b.foo.lock();
            work();
            b.foo.unlock();
        }

        void work() {
            x++;
        }
    }

    static class ByHash {
        int x;

        int hash(ReentrantLock r) {
            return r.hashCode() + r.getClass().hashCode();
        }

        void h(Holder b) {
            b.foo.lock();
            work();
            b.foo.unlock();
        }

        void work() {
            x++;
        }
    }

    static class Sub extends ReentrantLock {
        int x;

        void h(Holder b) {
            b.foo.lock();
            work();
            b.foo.unlock();
            super.lock();
            super.unlock();
            this.lock();
        }

        void work() {
            x++;
        }
    }
}
