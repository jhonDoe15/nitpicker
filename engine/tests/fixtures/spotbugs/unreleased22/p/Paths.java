package p;

import java.util.List;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

public class Paths {
    private Seg[] segments = new Seg[2];
    private int n;

    static final class Seg {
        final Lock rl = new ReentrantLock();
    }

    Object make() {
        return new ReentrantLock();
    }

    void labelledInner(List<String> xs) {
        for (int i = 0; i < segments.length; i++) {
            Seg s = segments[i];
            s.rl.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                s.rl.unlock();
            }
            inner:
            for (String y : xs) {
                for (String z : xs) {
                    continue inner;
                }
            }
            return;
        }
    }

    void otherBranch(List<String> xs, boolean b) {
        for (int i = 0; i < segments.length; i++) {
            Seg s = segments[i];
            s.rl.lock();
            if (b) {
                s.rl.unlock();
                for (String x : xs) {
                    work();
                }
                continue;
            }
            s.rl.unlock();
        }
    }

    void otherCase(List<String> xs, int k) {
        for (int i = 0; i < segments.length; i++) {
            Seg s = segments[i];
            s.rl.lock();
            switch (k) {
                case 1:
                    s.rl.unlock();
                    for (String x : xs) {
                        work();
                    }
                    break;
                default:
                    s.rl.unlock();
            }
        }
    }

    void deadBranch(List<String> xs, boolean b) {
        for (int i = 0; i < segments.length; i++) {
            Seg s = segments[i];
            s.rl.lock();
            if (b) {
                s.rl.unlock();
                for (String x : xs) {
                    work();
                }
                return;
            }
            work();
            s.rl.unlock();
        }
    }

    void work() {
        n--;
    }
}
