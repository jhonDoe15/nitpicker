package p;

import java.util.concurrent.*;
import java.util.concurrent.locks.*;

public class A {
    static class MySTPE extends ScheduledThreadPoolExecutor { MySTPE() { super(1); } void x() { setMaximumPoolSize(3); this.setMaximumPoolSize(3); super.setMaximumPoolSize(2); } }
    ScheduledThreadPoolExecutor fld = new ScheduledThreadPoolExecutor(1);
    ScheduledExecutorService svc = new ScheduledThreadPoolExecutor(1);
    void f1(ScheduledThreadPoolExecutor e) { e.setMaximumPoolSize(4); }
    void f2(MySTPE e) { e.setMaximumPoolSize(4); }
    void f3(ThreadPoolExecutor e) { e.setMaximumPoolSize(4); }
    void f4() { fld.setMaximumPoolSize(4); }
    void f5() { ((ScheduledThreadPoolExecutor) svc).setMaximumPoolSize(4); }
    void f6() { ScheduledThreadPoolExecutor e = new ScheduledThreadPoolExecutor(1); e.setMaximumPoolSize(4); }
    void f7() { var e = new ScheduledThreadPoolExecutor(1); e.setMaximumPoolSize(4); }
    void f8() { new ScheduledThreadPoolExecutor(1).setMaximumPoolSize(4); }
    void f9() { new ScheduledThreadPoolExecutor(1) { }.setMaximumPoolSize(4); }
    void f10(ScheduledThreadPoolExecutor e) { e.setMaximumPoolSize(4); ((ThreadPoolExecutor) e).setMaximumPoolSize(2); }
    void f11(ScheduledThreadPoolExecutor e) { ((ThreadPoolExecutor) e).setMaximumPoolSize(2); }
    void f12(Executor e) { ((ScheduledThreadPoolExecutor) e).setMaximumPoolSize(2); }
    void f13() { Executors.newScheduledThreadPool(2).toString(); ((ScheduledThreadPoolExecutor) Executors.newScheduledThreadPool(2)).setMaximumPoolSize(2); }
    void z1() { new ScheduledThreadPoolExecutor(0); Executors.newScheduledThreadPool(0); }
    void z2() { new ScheduledThreadPoolExecutor(0, Executors.defaultThreadFactory()); }
    void z3() { new ScheduledThreadPoolExecutor(0, (r, e) -> {}); }
    void z4() { Executors.newScheduledThreadPool(0, Executors.defaultThreadFactory()); }
    void z5() { ScheduledThreadPoolExecutor e = new ScheduledThreadPoolExecutor(1); e.setCorePoolSize(0); }
    void z6() { new MySTPE().setCorePoolSize(0); }
    void z7(ScheduledThreadPoolExecutor e) { e.setCorePoolSize(0); }
    void z8(ThreadPoolExecutor e) { e.setCorePoolSize(0); }
    void z9() { new ScheduledThreadPoolExecutor(0, Executors.defaultThreadFactory(), (r, e) -> {}); }
    void z10() { int zero = 0; new ScheduledThreadPoolExecutor(zero); }
    void z11() { new ScheduledThreadPoolExecutor(1 - 1); }
    void z12() { new ScheduledThreadPoolExecutor(0) { }; }
    static class Cond implements Condition { 
        public void await() {} public void awaitUninterruptibly() {} public long awaitNanos(long n) { return 0; }
        public boolean await(long t, TimeUnit u) { return true; } public boolean awaitUntil(java.util.Date d) { return true; }
        public void signal() {} public void signalAll() {}
    }
    static class Cond2 extends Cond {}
    void w1(Condition c) throws Exception { c.wait(); }
    void w2(Cond c) throws Exception { c.wait(); }
    void w3(Cond2 c) throws Exception { c.wait(100); }
    void w4(Cond c) throws Exception { synchronized (c) { c.wait(1, 2); } }
    void w5(Lock l) throws Exception { Condition c = l.newCondition(); c.wait(); }
    void w6(ReentrantLock l) throws Exception { l.newCondition().wait(); }
    void w7(Cond c) throws Exception { ((Object) c).wait(); }
    void w8(Cond c) throws Exception { ((Condition) c).wait(); }
    void w9(Object c) throws Exception { c.wait(); }
    void w10(AbstractQueuedSynchronizer.ConditionObject c) throws Exception { c.wait(); }
    Cond fc = new Cond();
    void w11() throws Exception { fc.wait(); }
    void w12() throws Exception { new Cond().wait(); }
    void w13() throws Exception { new Cond() {}.wait(); }
    void w14(Cond c) throws Exception { c.wait(); c.wait(5); }
    void w15(Cond c) throws Exception { var x = c; x.wait(); }
    Cond mc() { return fc; }
    void w16() throws Exception { mc().wait(); }
    void w17(Cond c) throws Exception { Runnable r = () -> { try { c.wait(); } catch (Exception e) {} }; }
    void u1() { new Thread().run(); new Thread() { }.run(); Thread t = new Thread(); t.run(); }
    void u2() { new Thread(() -> {}).run(); }
    void u3(Thread t) { t.run(); }
    void u4() { Thread.currentThread().run(); }
    void u5() { new Thread().start(); }
}
