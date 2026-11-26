package p;
import java.util.*;
import java.util.function.*;
class Par { Object pf = new Object(); static Object sp = new Object(); protected Object pm() { return null; } }
public class H extends Par {
    Object lock = new Object();
    static Object SL = new Object();
    int cnt; Object[][] g = new Object[2][2];
    int[] ia = new int[2];
    char ch; short sh; byte by; long lg; float fl; double db; boolean bo;
    synchronized void h01() { super.pf.notify(); }
    synchronized void h02() { this.pf.notify(); }
    synchronized void h03() { pf.notify(); }
    synchronized void h04() { super.sp.notify(); }
    synchronized void h05() { sp.notify(); }
    synchronized void h06() { super.hashCode(); lock.notify(); }
    synchronized void h07() { pm().notify(); }
    synchronized void h08() { g[0][1].notify(); }
    synchronized void h09() { ia[0]++; lock.notify(); }
    synchronized void h10() { int x = ia[0]; lock.notify(); }
    synchronized void h11() { long x = lg; lock.notify(); }
    synchronized void h12() { lg++; lock.notify(); }
    synchronized void h13() { ch++; lock.notify(); }
    synchronized void h15() { this.lock = lock; lock.notify(); }
    synchronized void h16() { Object x; x = lock; lock.notify(); }
    synchronized void h17() { String s = "a" + 1 + 'b'; lock.notify(); }
    synchronized void h18() { String s = "a" + SL; lock.notify(); }
    synchronized void h19() { String s = "a" + ""; String t = s + s; lock.notify(); }
    synchronized void h20() { int s = ch + 1; lock.notify(); }
    synchronized void h21() { double s = fl; lock.notify(); }
    synchronized void h22() { boolean s = bo; lock.notify(); }
    synchronized void h23() { boolean s = !bo; lock.notify(); }
    synchronized void h24() { boolean s = cnt > 1 && bo; lock.notify(); }
    synchronized void h25() { Object s = new Object[]{lock}; lock.notify(); }
    synchronized void h26() { Object s = new int[]{1, 2}; lock.notify(); }
    synchronized void h27() { Object s = new int[cnt]; lock.notify(); }
    synchronized void h28() { Object s = int.class; lock.notify(); }
    synchronized void h29() { Object s = H.class; lock.notify(); }
    synchronized void h30() { Object s = "x".length(); lock.notify(); }
    synchronized void h31() { "x".notify(); }
    synchronized void h32() { H.class.notify(); }
    synchronized void h33() { int.class.notify(); }
    synchronized void h34() { new Object().notify(); }
    synchronized void h35() { new int[1].notify(); }
    synchronized void h36() { ((Object) "x").notify(); }
    synchronized void h37() { Object.class.notify(); notify(); }
    synchronized void h38() { String.valueOf(1).notify(); }
    synchronized void h39() { Objects.requireNonNull(lock).notify(); }
    synchronized void h40() { (lock = new Object()).notify(); }
    synchronized void h41() { (SL = new Object()).notify(); }
    synchronized void h42() { (cnt > 0 ? lock : SL).notify(); }
    synchronized void h43() { (true ? lock : SL).notify(); }
    synchronized void h44() { switch (cnt) { case 1: notify(); } }
    synchronized void h45() { switch (cnt) { default: lock.notify(); } }
    synchronized void h46() { var x = lock; lock.notify(); }
    synchronized void h47() { int x = 077; lock.notify(); }
    synchronized void h48() { Object o = 1.5f; lock.notify(); }
    synchronized void h49() { assert cnt > 0; lock.notify(); }
    synchronized void h50() { do { } while (false); lock.notify(); }
    synchronized void h51() { ; lock.notify(); }
    synchronized void h52() { { lock.notify(); } }
    synchronized void h53() { lbl: { lock.notify(); } }
    synchronized void h54() { lbl: { if (cnt == 0) break lbl; lock.notify(); } }
    synchronized void h55() { Object o = lock; ; notify(); }
}
