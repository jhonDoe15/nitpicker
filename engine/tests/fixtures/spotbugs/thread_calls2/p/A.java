package p;

import java.util.concurrent.*;
import java.util.concurrent.locks.AbstractQueuedSynchronizer;

public class A {
    void main() {
        System.gc();
    }

    static void main(int x) {
        System.exit(1);
    }

    void exit() {
        System.exit(1);
    }

    void exitNow() {
        System.exit(1);
    }

    void gcx() {
        System.gc();
    }

    void xgc() {
        System.gc();
    }

    void runGC() {
        System.gc();
    }

    void testIt() {
        System.gc();
        System.exit(3);
    }

    static void stop() {
        System.exit(1);
        System.exit(2);
    }

    void cleanup() {
        System.runFinalization();
    }

    void m(Runnable r) {
    }

    void calls(Thread t, ExecutorService e) throws Exception {
        m(t);
        e.submit(t);
        e.submit((Runnable) t);
        Runnable r = t;
        m(r);
        java.util.List<Runnable> l = new java.util.ArrayList<>();
        l.add(t);
        e.submit(t, "x");
    }

    void pools(int n) {
        Executors.newScheduledThreadPool(0);
        Executors.newScheduledThreadPool(n);
        new ScheduledThreadPoolExecutor(0, new ThreadPoolExecutor.AbortPolicy()).shutdown();
    }

    void pools2(ScheduledThreadPoolExecutor e) {
        e.setCorePoolSize(0);
        e.setMaximumPoolSize(1);
    }

    void pools3(MyPool e) {
        e.setMaximumPoolSize(1);
    }

    static class MyPool extends ScheduledThreadPoolExecutor {
        MyPool() {
            super(1);
        }
    }

    void cond(AbstractQueuedSynchronizer.ConditionObject c) throws InterruptedException {
        c.wait();
    }

    Runnable lam(Thread t) {
        return () -> new Thread(t).start();
    }
}
