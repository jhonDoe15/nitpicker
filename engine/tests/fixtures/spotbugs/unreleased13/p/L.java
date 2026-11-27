package p;

import java.util.concurrent.locks.*;

public class L {
    private final Lock lk = new ReentrantLock();
    private int n;

    class OwnLockOuterCall {
        final Lock own = new ReentrantLock();

        void other() {
            own.lock();
            work();
            own.unlock();
        }
    }

    class OuterLockOwnCall {
        void other() {
            lk.lock();
            hashCode();
            lk.unlock();
        }
    }

    class OuterLockLocal {
        void other() {
            Lock l = lk;
            l.lock();
            hashCode();
            l.unlock();
        }
    }

    void work() {
        n--;
    }
}
