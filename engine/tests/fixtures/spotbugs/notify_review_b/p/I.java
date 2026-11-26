package p;
public class I {
    Object lock = new Object();
    static final boolean T = true;
    int cnt; boolean bo;
    synchronized void i01() { Object o = true ? 1 : 2; lock.notify(); }
    synchronized void i02() { Object o = false ? 1 : 2; lock.notify(); }
    synchronized void i03() { Object o = T ? lock : null; lock.notify(); }
    synchronized void i04() { boolean o = true && bo; lock.notify(); }
    synchronized void i05() { boolean o = false && bo; lock.notify(); }
    synchronized void i06() { boolean o = true || bo; lock.notify(); }
    synchronized void i07() { boolean o = bo && true; lock.notify(); }
    synchronized void i08() { boolean o = bo || false; lock.notify(); }
    synchronized void i09() { int o = true ? cnt : 2; lock.notify(); }
    synchronized void i10() { int o = false ? cnt : 2; lock.notify(); }
    synchronized void i11() { Object o = T ? null : lock; lock.notify(); }
    synchronized void i12() { while (T) { lock.notify(); break; } }
    synchronized void i13() { if (!T) { cnt++; } lock.notify(); }
    synchronized void i14() { if (T && bo) { cnt++; } lock.notify(); }
    synchronized void i15() { if (bo && T) { cnt++; } lock.notify(); }
    synchronized void i16() { if (T || bo) { cnt++; } lock.notify(); }
    synchronized void i17() { boolean o = !T; lock.notify(); }
    synchronized void i18() { boolean o = T == true; lock.notify(); }
    synchronized void i19() { boolean o = (bo); lock.notify(); }
    synchronized void i20() { boolean o = cnt == 0 ? true : false; lock.notify(); }
    synchronized void i21() { for (;;) { lock.notify(); break; } }
    synchronized void i22() { for (int i = 0; ; i++) { lock.notify(); break; } }
    synchronized void i23() { for (int i = 0; i < 1; ) { lock.notify(); break; } }
    synchronized void i24() { while (bo) { lock.notify(); } }
    synchronized void i25() { do { lock.notify(); } while (bo); }
    synchronized void i26() { int x = 3; if (x > 2) { cnt++; } lock.notify(); }
    synchronized void i27() { final int x = 3; if (x > 2) { cnt++; } lock.notify(); }
    synchronized void i28() { final int x = 3; int y = x > 2 ? cnt : 0; lock.notify(); }
    synchronized void i29() { final boolean x = true; if (x) { cnt++; } lock.notify(); }
    synchronized void i30() { if (true) { } else { cnt++; } lock.notify(); }
}
