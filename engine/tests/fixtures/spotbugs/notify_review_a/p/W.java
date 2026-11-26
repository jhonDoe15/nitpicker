package p;
import java.util.*;
public class W {
    int count; boolean flag; final Object lock = new Object(); int[] arr = new int[2]; List<String> list = new ArrayList<>();
    public synchronized void e1() { try { } finally { count = 1; } notify(); }
    public synchronized void e2() { try { } finally { notify(); } }
    public synchronized void e3() { try { ; } finally { notify(); } }
    public synchronized void e4() { try { } catch (Exception e) { } finally { notify(); } }
    public synchronized void e5() { try { } catch (RuntimeException e) { notify(); } }
    public synchronized void e6() { try { count = 1; } finally { notify(); } }
    public synchronized void e7() { try { int x = 1; } finally { notify(); } }
    public synchronized void e8() { try { notify(); } finally { notify(); } }
    public synchronized void e9() { try { throw new RuntimeException(); } finally { notify(); } }
    public synchronized void e10() { try { System.gc(); } finally { notify(); } }
    public synchronized void e11() { try { return; } finally { notify(); } }
    public synchronized void e12(boolean b) { try { if (b) return; } finally { notify(); } }
    public synchronized void e13() { while (true) { try { break; } finally { notify(); } } }
    public synchronized void e14() { for (int i = 0; i < 2; i++) { try { continue; } finally { notify(); } } }
    public synchronized void e15() { try { try { } finally { notify(); } } finally { } }
    public synchronized void e16() { int r = switch (count) { case 1 -> { yield 2; } default -> 3; }; notify(); }
    public synchronized void e17() { int r = switch (1) { case 1 -> 2; default -> 3; }; notify(); }
    public synchronized void e18() { switch (1) { case 1: notify(); } }
    public synchronized void e19() { switch (count) { case 1: notify(); } }
    public synchronized void e20() { synchronized (lock) { } notify(); }
    public synchronized void e21() { notify(); synchronized (lock) { } }
    public void e22() { synchronized (lock) { } synchronized (lock) { notify(); } }
    public void e23() { synchronized (lock) { synchronized (lock) { lock.notify(); } } }
    public void e24() { synchronized (lock) { try { lock.notify(); } catch (Exception e) { } } }
    public void e25() { synchronized (lock) { lock.notify(); } }
    public void e26(boolean b) { if (b) { synchronized (lock) { lock.notify(); } } else { synchronized (lock) { lock.notifyAll(); } } }
    public void e27() { for (int i = 0; i < 2; i++) { synchronized (lock) { lock.notify(); } } }
    public void e28() { while (flag) { synchronized (lock) { lock.notify(); continue; } } }
    public void e29() { for (Object o : list) { synchronized (lock) { lock.notify(); } } }
    public void e30() { for (int v : arr) synchronized (lock) { lock.notify(); } }
    public synchronized void e31() { for (int i = 0; ; i++) { notify(); break; } }
    public synchronized void e32() { int i = 0; do { i++; } while (i < 3); notify(); }
    public synchronized void e33() { for (int i = 0, j = 1; i < j; i++, j--) { } notify(); }
    public synchronized void e34() { l: for (;;) { for (;;) { break l; } } notify(); }
    public synchronized void e35() { l: for (int i = 0; i < 2; i++) { for (;;) { continue l; } } notify(); }
    public synchronized void e36() { if (false) { count = 1; } notify(); }
    public synchronized void e37() { if (true) { notify(); } }
    public synchronized void e38() { if (true) { count = 1; } notify(); }
    public synchronized void e39(boolean b) { if (b) { } else { } notify(); }
    public synchronized void e40(boolean b) { b = !b; notify(); }
    public synchronized void e41(boolean b) { boolean c = b && true; notify(); }
    public synchronized void e42() { boolean c = true && false; notify(); }
    public synchronized void e43() { assert count > 0; notify(); }
    public synchronized void e44() { String s = "a" + 1; notify(); }
    public synchronized void e45() { String s = null; s = "x"; notify(); }
    public synchronized void e46() { int x = 1 > 0 ? 1 : 2; notify(); }
    public synchronized void e47() { int[] a = {1, 2}; notify(); }
    public synchronized void e48() { int[][] a = new int[2][2]; notify(); }
    public synchronized void e49() { long l = 1L; l++; notify(); }
    public synchronized void e50() { Object o = (Object) "x"; notify(); }
    public synchronized void e51() { Object o = (Comparable) "x"; notify(); }
    public synchronized void e52() { Integer i = 1; notify(); }
    public synchronized void e53() { int i = Integer.valueOf(1); notify(); }
    public synchronized void e54() { var s = new StringBuilder(); notify(); }
    public synchronized void e55() { throw new IllegalStateException(); }
    public synchronized void e56() { notify(); return; }
    public synchronized void e57() { notify(); return; }
}
