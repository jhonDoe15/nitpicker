package p;

import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.locks.AbstractQueuedSynchronizer;

public class A {
    void mainly() {
        System.gc();
    }

    void domain() {
        System.gc();
    }

    void attest() {
        System.gc();
    }

    void Testing() {
        System.gc();
    }

    void tester() {
        System.gc();
        System.exit(1);
    }

    void gcTest() {
        System.gc();
    }

    void aGc() {
        System.gc();
    }

    void exits() {
        System.exit(1);
    }

    void doexit() {
        System.exit(1);
    }

    void Exit() {
        System.exit(1);
    }

    void twoExits() {
        System.exit(1);
        System.exit(2);
    }

    void w(AbstractQueuedSynchronizer.ConditionObject c) throws InterruptedException {
        c.wait(10L);
        c.wait(10L, 1);
        c.wait();
    }

    void w2(AbstractQueuedSynchronizer.ConditionObject c) throws InterruptedException {
        c.wait(10L);
    }

    void w3(Sub c) throws InterruptedException {
        c.wait();
    }

    static class Sub extends AbstractQueuedSynchronizer {
    }

    void p(ScheduledThreadPoolExecutor a, ScheduledThreadPoolExecutor b) {
        a.setMaximumPoolSize(1);
        b.setMaximumPoolSize(2);
    }

    void q(ScheduledThreadPoolExecutor a) {
        a.setMaximumPoolSize(
            1);
    }

    Runnable lam() {
        return () -> System.exit(4);
    }

    class Inner {
        Inner() {
            System.exit(5);
            System.gc();
        }
    }

    static {
        System.gc();
    }

    void t(Thread a, Thread b) {
        new Thread(a);
        new Thread(
            b);
    }
}
