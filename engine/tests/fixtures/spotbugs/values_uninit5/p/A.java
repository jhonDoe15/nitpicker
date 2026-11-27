package p;

import java.util.*;

public class A {
    static final class F {}
    static class G {}
    List<String> list;
    int h;
    Object o;
    Integer i;
    CharSequence cs;
    StringBuilder sb;
    F f;
    G g;
    String s;

    A(int x, byte t) { System.out.println(h); h = x; }
    A(Object x, byte t) { System.out.println(o); o = x; }
    A(Integer x, byte t) { System.out.println(i); i = x; }
    A(CharSequence x, byte t) { System.out.println(cs); cs = x; }
    A(StringBuilder x, byte t) { System.out.println(sb); sb = x; }
    A(F x, byte t) { System.out.println(f); f = x; }
    A(G x, byte t) { System.out.println(g); g = x; }
    A(List<String> x, long t) { System.out.println(list); List<String> y = x; list = y; }
    A(String x, short t) { System.out.println(s); this.s = x; }
    A(G x, short t) { System.out.println(g); this.g = x; }
    A(G x, char t) { this.g = x; }
    A(G x, long t) { System.out.println(g); }
    A(G x, float t) { System.out.println(g); g = null; g = x; }
}
