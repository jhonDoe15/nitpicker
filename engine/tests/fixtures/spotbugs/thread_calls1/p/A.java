package p;

import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.locks.Condition;

public class A {
    static void collect() {
        System.gc();
    }

    void collect2() {
        Runtime.getRuntime().gc();
    }

    void twice() {
        System.gc();
        System.gc();
    }

    void inFinally() {
        try {
            run();
        } finally {
            System.gc();
        }
    }

    void inCatch() {
        try {
            run();
        } catch (RuntimeException e) {
            System.gc();
        }
    }

    void doGc() {
        System.gc();
    }

    void loop() {
        for (int i = 0; i < 3; i++) {
            System.gc();
        }
    }

    void run() {
    }

    void quit() {
        System.exit(1);
    }

    void quit2() {
        Runtime.getRuntime().exit(2);
    }

    void quit3() {
        Runtime.getRuntime().halt(3);
    }

    public static void main(String[] args) {
        System.exit(0);
    }

    void th(Thread t, Runnable r) {
        new Thread(t).start();
        new Thread(t, "n").start();
        new Thread(null, t).start();
        new Thread(null, t, "n").start();
        new Thread(null, t, "n", 10).start();
        new Thread(r).start();
        Thread x = new Thread();
        x.start();
        new Thread("n").start();
    }

    void th2(Sub s) {
        new Thread(s).start();
        new Thread(new Thread()).start();
    }

    static class Sub extends Thread {
    }

    void th3(Thread t, java.util.concurrent.Executor e) {
        e.execute(t);
    }

    void cond(Condition c) throws InterruptedException {
        while (true) {
            c.wait();
        }
    }

    void cond2(Condition c) throws InterruptedException {
        while (true) {
            c.wait(10L);
        }
    }

    void pool(ScheduledThreadPoolExecutor e, ThreadPoolExecutor t) {
        e.setMaximumPoolSize(4);
        t.setMaximumPoolSize(4);
        e.setMaximumPoolSize(5);
    }

    void pool2() {
        ScheduledThreadPoolExecutor z = new ScheduledThreadPoolExecutor(0);
        ScheduledThreadPoolExecutor o = new ScheduledThreadPoolExecutor(1);
        System.out.println(z + "" + o);
    }

    void pool3() {
        new ScheduledThreadPoolExecutor(0).shutdown();
    }

    static final int ZERO = 0;

    void pool4() {
        new ScheduledThreadPoolExecutor(ZERO, (Runnable r, ThreadPoolExecutor ex) -> { }).shutdown();
    }
}
