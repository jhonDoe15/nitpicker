package p;

import java.util.concurrent.locks.*;

public class H {
    private final Lock lk = new ReentrantLock();
    private static final Object ST = new Object();
    private static int S;
    private static long L;
    private static final H OTHER = new H();
    private int n;
    private double d;
    private H peer;
    private int[] arr = new int[1];
    private Object obj;
    private Integer boxed = 1;

    void t1() {
        lk.lock();
        n = n / 2;
        lk.unlock();
    }

    void t2() {
        lk.lock();
        n = n % 3;
        lk.unlock();
    }

    void t3() {
        lk.lock();
        d = d / 2.0;
        lk.unlock();
    }

    void t4() {
        lk.lock();
        Object o = ST;
        lk.unlock();
    }

    void t5() {
        lk.lock();
        S = 1;
        lk.unlock();
    }

    void t6() {
        lk.lock();
        peer.n = 1;
        lk.unlock();
    }

    void t7() {
        lk.lock();
        int k = arr.length;
        lk.unlock();
    }

    void t8() {
        lk.lock();
        boolean q = obj instanceof String;
        lk.unlock();
    }

    void t9() {
        lk.lock();
        Integer v = n;
        lk.unlock();
    }

    void u1() {
        lk.lock();
        int k = boxed;
        lk.unlock();
    }

    void u2() {
        lk.lock();
        long m = (long) n;
        lk.unlock();
    }

    void u3() {
        lk.lock();
        obj = null;
        lk.unlock();
    }

    void u4() {
        lk.lock();
        Object o = this;
        lk.unlock();
    }

    void u5() {
        lk.lock();
        String s = "x";
        lk.unlock();
    }

    void u6() {
        lk.lock();
        Class<?> c = H.class;
        lk.unlock();
    }

    void u7() {
        lk.lock();
        Runnable r = () -> { };
        lk.unlock();
    }

    void u8() {
        lk.lock();
        Object o = peer;
        lk.unlock();
    }

    void u9() {
        lk.lock();
        assert n > 0;
        lk.unlock();
    }

    void v1() {
        lk.lock();
        L = 5L / 2L;
        lk.unlock();
    }

    void v2() {
        lk.lock();
        n = OTHER.n;
        lk.unlock();
    }

    void p1() {
        peer.lk.lock();
        n++;
        peer.lk.unlock();
    }
}
