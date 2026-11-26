package p;
import java.util.*;
import java.util.function.*;
public class B {
    Object lock = new Object();
    static final int SC = 7;
    final int fi = 4;
    static int sc2 = 9;
    int cnt; Integer boxed = 1;
    synchronized void b01() { int x = 1; x = x + 1; lock.notify(); }
    synchronized void b02() { int x = 1; x -= 32768; lock.notify(); }
    synchronized void b03() { int x = 1; x += 32768; lock.notify(); }
    synchronized void b04() { int x = 1; x += SC; lock.notify(); }
    synchronized void b05() { int x = 1; x += fi; lock.notify(); }
    synchronized void b06() { int x = 1; x += (1); lock.notify(); }
    synchronized void b07() { int x = 1; x += 1 + 2; lock.notify(); }
    synchronized void b08() { int x = 1; x += 0x10; lock.notify(); }
    synchronized void b09() { int x = 1; x -= -1; lock.notify(); }
    synchronized void b10() { int x = 1; x += (byte) 1; lock.notify(); }
    synchronized void b11() { int x = 1; x += 1_0; lock.notify(); }
    synchronized void b12() { int x = 1; x += 1L; lock.notify(); }
    synchronized void b13() { int x = 1; int y = x++; lock.notify(); }
    synchronized void b14() { int x = 1; int y = x++ + 1; lock.notify(); }
    synchronized void b15() { for (int i = 0; i < 3; i++) { } lock.notify(); }
    synchronized void b16() { int x = 1; x <<= 1; lock.notify(); }
    synchronized void b17() { int x = 1; x += x; lock.notify(); }
    synchronized void b18() { int x = 1; x += +1; lock.notify(); }
    synchronized void b19() { int x = 1; x += 'a' + 1; lock.notify(); }
    synchronized void b20() { int x = 1; x += (short) 1; lock.notify(); }
    synchronized void b21() { int x = 1; x += 077; lock.notify(); }
    synchronized void b22() { int x = 1; x += 0b11; lock.notify(); }
    synchronized void b23() { int x = 1; x += 3 * 4; lock.notify(); }
    synchronized void b24() { int x = 1; x += true ? 1 : 2; lock.notify(); }
    synchronized void b25() { final int k = 3; int x = 1; x += k; lock.notify(); }
    synchronized void b26() { final int k = 3; int y = k; lock.notify(); }
    synchronized void b27() { int k = 3; int y = k; lock.notify(); }
    synchronized void b28() { final String k = "q"; String y = k + k; lock.notify(); }
    synchronized void b29() { int y = sc2; lock.notify(); }
    synchronized void b30() { boolean z = true && false; lock.notify(); }
    synchronized void b31() { int y = (int) 3L; lock.notify(); }
    synchronized void b32() { int y = (int) 3.5; lock.notify(); }
    synchronized void b33() { long y = (long) cnt; lock.notify(); }
    synchronized void b34() { int y = -SC; lock.notify(); }
    synchronized void b35() { boolean y = !true; lock.notify(); }
    synchronized void b36() { int y = ~SC; lock.notify(); }
    synchronized void b37() { int y = -cnt; lock.notify(); }
    synchronized void b38() { int y = SC > 3 ? 1 : 2; lock.notify(); }
    synchronized void b39() { String s = "a" + 1; lock.notify(); }
    synchronized void b40() { String s = "a" + 'c' + 1.5 + true + null; lock.notify(); }
    synchronized void b41() { Object o = (Object) "s"; lock.notify(); }
    synchronized void b42() { Object o = (String) "s"; lock.notify(); }
    synchronized void b43() { Object o = (CharSequence) "s"; lock.notify(); }
    synchronized void b44() { Object o = (Integer) 5; lock.notify(); }
    synchronized void b45() { Integer o = 5; lock.notify(); }
    synchronized void b46() { int o = Integer.valueOf(5); lock.notify(); }
    synchronized void b47() { long o = 5; lock.notify(); }
    synchronized void b48() { Long o = 5L; lock.notify(); }
    synchronized void b49() { Object o = 5; lock.notify(); }
    synchronized void b50() { int o = boxed; lock.notify(); }
}
