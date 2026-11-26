package p;
import java.util.*;
public class X {
    private int count; private boolean flag; private final Object lock = new Object();
    private int[] arr = new int[3]; private List<String> list = new ArrayList<>();
    public synchronized void w1() { while (flag) { count++; } notify(); }
    public synchronized void w2() { for (int i = 0; i < 3; i++) { } notify(); }
    public synchronized void w3() { do { } while (false); notify(); }
    public synchronized void w4() { for (int v : arr) { } notify(); }
    public synchronized void w5() { for (String s : list) { } notify(); }
    public synchronized void w6() { notify(); while (true) { } }
    public synchronized void w7() { notify(); for (;;) { count++; } }
    public synchronized void w8() { outer: while (true) { while (true) { break outer; } } notify(); }
    public synchronized void w9() { for (int i = 0; i < 3; i++) { if (i == 1) continue; } notify(); }
    public synchronized void w10(boolean b) { if (b) { notify(); } else { notify(); } }
    public synchronized void w11(boolean b) { if (b) { if (b) { notify(); } } else { count = 1; } }
    public synchronized void t1() { try { notify(); } finally { } }
    public synchronized void t2() { try { notify(); } catch (RuntimeException e) { } }
    public synchronized void t3() { try { } finally { notify(); } }
    public synchronized int t4() { try { notify(); return 1; } finally { count = 2; } }
    public synchronized void t5() { try { try { notify(); } finally { } } catch (Exception e) { } }
    public synchronized void t6() { try { notify(); } catch (IllegalStateException | IllegalArgumentException e) { } }
    public synchronized void t7() throws Exception { try (java.io.StringReader r = new java.io.StringReader("")) { notify(); } }
    public synchronized void t8() { try { count = 1; } catch (Exception e) { notify(); } }
    public synchronized void t9() { try { notify(); } finally { notify(); } }
    public synchronized void t10() { try { notifyAll(); } finally { System.gc(); } }
    public synchronized void s1(int i) { switch (i) { case 1: notify(); break; default: break; } }
    public synchronized void s2(int i) { switch (i) { case 1 -> notify(); default -> {} } }
    public synchronized void s3(String s) { switch (s) { case "a": notify(); break; } }
    public synchronized void s4(Thread.State e) { switch (e) { case NEW: notify(); break; default: } }
    public void s5(int i) { switch (i) { case 1: synchronized (lock) { lock.notify(); } break; } }
    public void s6(int i) { switch (i) { case 1 -> { synchronized (lock) { lock.notify(); } } default -> {} } }
    public synchronized void s7() { int i = 1; switch (i) { case 1: break; } notify(); }
    public int r1(boolean b) { synchronized (lock) { if (b) { lock.notify(); return 1; } } return 2; }
    public int r2() { synchronized (lock) { lock.notify(); return 1; } }
    public void r3() { synchronized (lock) { synchronized (this) { notify(); } } }
    public void r4() { synchronized (this) { synchronized (lock) { lock.notify(); } } }
    public synchronized void r5() { synchronized (lock) { lock.notify(); } }
    public synchronized void r6() { synchronized (this) { notify(); } }
    public void r7() { synchronized (lock) { lock.notify(); } synchronized (lock) { lock.notifyAll(); } }
    public void r8(boolean b) { synchronized (lock) { if (b) return; lock.notify(); } }
    public void r9(boolean b) { synchronized (lock) { while (b) { lock.notify(); break; } } }
    public void r10() { synchronized (lock) { try { lock.notify(); } finally { } } }
    public void r11() { synchronized (lock) { lock.notify(); throw new RuntimeException(); } }
    public synchronized void r12() { notify(); throw new RuntimeException(); }
    public void r13() { synchronized (lock) { lock.notify(); lock.notify(); } }
    public synchronized void r14() { for (int i = 0; i < 3; i++) { notify(); } }
    public synchronized void r15() { for (int i = 0; i < 3; i++) { notify(); break; } }
    public synchronized void r16() { do { notify(); } while (flag); }
    public synchronized void r17() { while (true) { notify(); return; } }
    public synchronized void r18() { while (true) { notify(); } }
    public synchronized void r19() { l: { notify(); break l; } }
    public synchronized void r20() { notify(); ; ; }
    public synchronized void r21(boolean b) { notify(); if (b) { return; } }
    public synchronized void r22() { notify(); { } }
    public synchronized void r23() { notify(); int x = 1; }
    public synchronized void r24() { notify(); count = 1; }
    public synchronized void r25() { notify(); System.gc(); }
}
