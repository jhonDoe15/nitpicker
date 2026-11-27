package p;
import java.util.*;
import java.util.function.*;
interface I1 { }
class Cl { Object o = new Object(); static Object so = new Object(); static Cl inst() { return null; } static Object sf() { return null; } }
public class D<A extends I1, B extends A, X extends Object & I1, Y extends Cl & I1> {
    Object lock = new Object();
    A a; B b; X x; Y y; Cl cl = new Cl(); Cl[] cls = new Cl[1];
    static Object SO = new Object();
    List<Cl> list = new ArrayList<>();
    synchronized void d01() { a.notify(); }
    synchronized void d02() { b.notify(); }
    synchronized void d03() { x.notify(); }
    synchronized void d04() { y.notify(); }
    synchronized <Q extends I1> void d05(Q q) { q.notify(); }
    synchronized <Q extends Object & I1> void d06(Q q) { q.notify(); }
    synchronized <Q extends I1 & Comparable<Q>> void d07(Q q) { q.notify(); }
    synchronized <Q extends Cl & I1> void d08(Q q) { q.o.notify(); }
    synchronized <Q extends Cl & I1> void d09(Q q) { q.notify(); }
    synchronized void d10() { cl.so.notify(); }
    synchronized void d11() { cls[0].so.notify(); }
    synchronized void d12() { Cl.inst().so.notify(); }
    synchronized void d13() { this.cl.so.notify(); }
    synchronized void d14() { new Cl().so.notify(); }
    synchronized void d15() { list.get(0).o.notify(); }
    synchronized void d16() { Cl.sf().notify(); }
    synchronized void d17(Cl p) { p.so.notify(); }
    synchronized void d18() { D.SO.notify(); }
    synchronized void d19() { this.SO.notify(); }
    synchronized void d20() { Object o = this.SO; lock.notify(); }
    synchronized void d21() { Object o = cl.so; lock.notify(); }
    synchronized void d22() { SO.notify(); }
    synchronized void d23() { p.D.SO.notify(); }
    synchronized void d24(Cl p) { Object o = p.so; lock.notify(); }
    synchronized void d25() { Object o = ((Cl) null).so; lock.notify(); }
    synchronized void d26() { cl.so = null; lock.notify(); }
    synchronized void d27() { cl.o = null; lock.notify(); }
    synchronized void d28() { this.SO = null; lock.notify(); }
    synchronized void d29() { this.lock = null; lock.notify(); }
    synchronized void d30() { Cl.so = null; lock.notify(); }
    synchronized void d31(Cl p) { p.so = null; lock.notify(); }
    synchronized void d32() { cl.so.hashCode(); lock.notify(); }
    synchronized void d33() { int len = cls.length; lock.notify(); }
    synchronized void d34() { int len = new int[2].length; lock.notify(); }
    synchronized void d35() { int len = cls[0].so.hashCode(); lock.notify(); }
    synchronized void d36() { SO = lock = null; lock.notify(); }
    synchronized void d37(int[] p) { p[0]++; lock.notify(); }
    synchronized void d38(int[] p) { p[0] = 1; lock.notify(); }
    synchronized void d39(int[] p) { p[0] += 1; lock.notify(); }
    synchronized void d40() { cl.o = cl.o; lock.notify(); }
    synchronized void d41() { SO = SO; lock.notify(); }
    synchronized void d42() { Object o; o = SO; lock.notify(); }
    synchronized void d43() { Object o = SO = null; lock.notify(); }
    synchronized void d44(boolean f) { Object o = f ? null : null; lock.notify(); }
    synchronized void d45(boolean f) { Object o = f ? 1 : 2; lock.notify(); }
    synchronized void d46() { Object o = true ? 1 : 2; lock.notify(); }
    synchronized void d47(Object p) { Object o = p == null; lock.notify(); }
    synchronized void d48() { boolean o = lock == null; lock.notify(); }
    synchronized void d49() { boolean o = lock instanceof String; lock.notify(); }
    synchronized void d50() { boolean o = null instanceof String; lock.notify(); }
}
