package p;

import java.util.*;

public class A {
    static class G {}
    T t;
    E e;
    I i;
    p.q.U u;
    G g;
    G[] ga;
    List<G> lg;
    Map<String, String> m;
    Thread th;

    A(T x, byte y) { System.out.println(t); }
    A(E x, byte y) { System.out.println(e); }
    A(I x, byte y) { System.out.println(i); }
    A(p.q.U x, byte y) { System.out.println(u); }
    A(byte y) { System.out.println(g); }
    A(short y) { System.out.println(ga); }
    A(List<G> x, byte y) { System.out.println(lg); }
    A(Map<String, String> x, byte y) { System.out.println(m); }
    A(Thread x, byte y) { System.out.println(th); }
    A(char y) { System.out.println(t); }
    A(long y) { System.out.println(th); }
    A(T x, short y) { t.hashCode(); }
}
