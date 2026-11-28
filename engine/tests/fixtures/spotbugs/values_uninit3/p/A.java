package p;

import java.util.*;

public class A {
    List<String> list;
    String s;
    int h;

    A(List<String> x, byte t) { list.add("a"); list = x; }
    A(List<String> x, short t) { list.add("a"); }
    A(List<String> x, char t) { System.out.println(list.size()); list = x; }
    A(List<String> x, long t) { list.size(); }
    A(List<String> x, float t) { list.clear(); }
    A(String x, byte t) { s.length(); }
    A(String x, short t) { s.trim(); }
    A(String x, char t) { System.out.println(s.trim()); }
    A(int x, byte t) { System.out.println(h); }
    A(int x, short t) { long q = h; }
    A(int x, char t) { System.out.println(h); h = 1; }
}
