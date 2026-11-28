package p;
import java.util.*;
import java.util.function.*;
interface K { int I = 5; String S = "s"; long L = 5L; }
class C { static final int SI = 3; final int fi = 4; static final String SS = "x"; static Object so = new Object(); Object o = new Object(); C next; Object[] arr = new Object[1]; static final Object CO = new Object(); }
enum E { X, Y; Object f = new Object(); }
public class A implements K {
    Object lock = new Object();
    static Object SL = new Object();
    final int fi = 4;
    final long fl = 4L;
    final String fs = "a";
    final Integer boxed = 4;
    final int nonconst = Integer.MAX_VALUE + count();
    static int count() {
        return 1;
    }
    C c = new C();
    Object[] arr = new Object[2];
    int cnt; short sh; byte by; char ch; long lg;
    int[] ia = new int[3];
    class In { Object q = new Object(); void m() { synchronized (this) { A.this.lock.notify(); } } }
    static class SN { Object z; }
    synchronized void a01() { c.o.notify(); }
    synchronized void a02() { c.next.o.notify(); }
    synchronized void a03() { A.this.lock.notify(); }
    synchronized void a04() { c.so.notify(); }
    synchronized void a05() { C.so.notify(); }
    synchronized void a06() { this.c.so.notify(); }
    synchronized void a07() { int x = K.I; lock.notify(); }
    synchronized void a08() { int x = I; lock.notify(); }
    synchronized void a09() { long x = L; lock.notify(); }
    synchronized void a10() { String x = S; lock.notify(); }
    synchronized void a11() { int x = C.SI; lock.notify(); }
    synchronized void a12() { int x = c.fi; lock.notify(); }
    synchronized void a13() { int x = fi; lock.notify(); }
    synchronized void a14() { long x = fl; lock.notify(); }
    synchronized void a15() { String x = fs; lock.notify(); }
    synchronized void a16() { Integer x = boxed; lock.notify(); }
    synchronized void a17() { int x = nonconst; lock.notify(); }
    synchronized void a18() { int x = this.fi; lock.notify(); }
    synchronized void a19() { int x = A.this.fi; lock.notify(); }
    synchronized void a20() { int x = fi + 1; lock.notify(); }
    synchronized void a21() { int x = C.SI * 2 + K.I; lock.notify(); }
    synchronized void a22() { String x = "a" + fs; lock.notify(); }
    synchronized void a23() { String x = "a" + cnt; lock.notify(); }
    synchronized void a24() { String x = C.SS + "q"; lock.notify(); }
    synchronized void a25() { int x = arr.length; lock.notify(); }
    synchronized void a26() { int x = this.arr.length; lock.notify(); }
    synchronized void a27() { int x = c.arr.length; lock.notify(); }
    synchronized void a28() { arr[0].notify(); }
    synchronized void a29() { arr[cnt].notify(); }
    synchronized void a30() { Object[] a = {lock}; lock.notify(); }
    synchronized void a31() { Object[] a = new Object[]{"a", "b"}; lock.notify(); }
    synchronized void a32() { Object[] a = new Object[3]; lock.notify(); }
    synchronized void a33() { int[][] a = new int[2][3]; lock.notify(); }
    synchronized void a34() { int x = 1; x += 2; lock.notify(); }
    synchronized void a35() { short x = 1; x += 2; lock.notify(); }
    synchronized void a36() { byte x = 1; x++; lock.notify(); }
    synchronized void a37() { char x = 1; x++; lock.notify(); }
    synchronized void a38() { long x = 1; x++; lock.notify(); }
    synchronized void a39() { int x = 1; x -= 5; lock.notify(); }
    synchronized void a40() { int x = 1; ++x; lock.notify(); }
    synchronized void a41() { int x = 1; x--; lock.notify(); }
    synchronized void a42() { int x = 1; x += 40000; lock.notify(); }
    synchronized void a43() { int x = 1; x *= 2; lock.notify(); }
    synchronized void a44() { cnt++; lock.notify(); }
    synchronized void a45() { cnt += 1; lock.notify(); }
    synchronized void a46() { SL = null; lock.notify(); }
    synchronized void a47() { double x = 1; x++; lock.notify(); }
    synchronized void a48() { Integer x = 1; x++; lock.notify(); }
    synchronized void a49() { int x = 1; x += -1; lock.notify(); }
    synchronized void a50() { int x = 1; x += 'a'; lock.notify(); }
}
