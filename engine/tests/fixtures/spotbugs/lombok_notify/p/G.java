package p;
import lombok.Synchronized;
public class G {
    private final Object lock = new Object();
    static final Object SLOCK = new Object();
    private int count;
    @Synchronized public void l01() { notify(); }
    @Synchronized public static void l02() { SLOCK.notify(); }
    @Synchronized public static void l03() { G.class.notify(); }
    @Synchronized("lock") public void l04() { lock.notify(); }
    @Synchronized("lock") public void l05() { notify(); }
    @Synchronized("SLOCK") public static void l06() { SLOCK.notifyAll(); }
    @Synchronized public int l07() { notify(); return 1; }
    @Synchronized public int l08() { notify(); return count; }
    @Synchronized public void l09() { this.notify(); }
    @Synchronized public void l10() { notifyAll(); }
    @Synchronized public void l11() { synchronized (lock) { lock.notify(); } }
    @Synchronized public void l12() { try { notify(); } finally { } }
    @Synchronized public void l13() { try { notify(); } catch (RuntimeException e) { } }
    @Synchronized public void l14(boolean b) { if (b) notify(); else notifyAll(); }
    @Synchronized public void l15() { notify(); notify(); }
    @Synchronized public void l16() { while (true) { notify(); } }
    @Synchronized public Object l17() { notify(); return null; }
    @Synchronized public boolean l18() { notify(); return true; }
    @Synchronized public void l19() { lock.notify(); }
    @Synchronized public void l20() { int x = 1; notify(); }
    @Synchronized public void l21() { count++; notify(); }
    @Synchronized public void l22() { throw new RuntimeException(); }
    @Synchronized public void l23() { Runnable r = () -> notify(); }
    @Synchronized public static void l24() { int x = 1; SLOCK.notify(); }
    @Synchronized public void l25() { notify(); return; }
    @Synchronized public void l26() { new Object(); notify(); }
    @Synchronized public void l27() { String s = "x"; notify(); }
    @Synchronized public long l28() { notify(); return 1L; }
    @Synchronized public void l29() { for (int i = 0; i < 2; i++) { notify(); } }
}
