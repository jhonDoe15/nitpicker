package p;

import java.util.concurrent.locks.*;

public class M {
    private final Lock lk = new ReentrantLock();
    private int[] arr = new int[1];
    private M peer;
    private int n;
    private int x;
    private Object obj;

    void r1() {
        lk.lock();
        x = arr[0];
        lk.unlock();
    }

    void r2() {
        lk.lock();
        x = peer.peer.n;
        lk.unlock();
    }

    void r3() {
        lk.lock();
        obj = (Object) peer;
        lk.unlock();
    }

    void r4() {
        lk.lock();
        peer.n++;
        lk.unlock();
    }

    void r5() {
        lk.lock();
        x = -n;
        x <<= 2;
        lk.unlock();
    }

    void r6() {
        lk.lock();
        obj = (Runnable) obj;
        lk.unlock();
    }

    void r7() {
        lk.lock();
        int[] a = arr;
        lk.unlock();
    }
}
