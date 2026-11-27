package p;

import java.util.concurrent.locks.ReentrantLock;

public class H {
    volatile int count; int mod; Object[] items = new Object[1];
    void c1() {
        try {
            int n = this.count;
            this.count = n;
        } finally {
            mod++;
        }
    }
    void c2() {
        for (int i = 0; i < 3; i++) {
            int n = this.count;
            this.count = n;
            return;
        }
    }
    void c3() {
        int n = this.count + 1;
        for (Object e : items) {
            if (e == null) {
                n = this.count;
                this.count = n;
                return;
            }
        }
        this.count = n;
    }
    void c4() {
        int n = 1;
        if (mod > 0) {
            n = this.count;
            this.count = n;
            return;
        }
        this.count = n;
    }
    void c5() {
        int n = this.count;
        this.count = n;
        mod = n;
    }
    void c6() { count = count; }
    void c7() {
        int n = 1;
        n = this.count;
        this.count = n;
        this.count = n;
    }
    static class L extends ReentrantLock {
        volatile int count;
        void d1() { int n = this.count; this.count = n; }
    }
}
