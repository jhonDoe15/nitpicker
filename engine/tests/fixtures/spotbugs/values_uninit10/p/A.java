package p;

import java.util.*;

public class A {
    Date d;
    Map<String, String> m;
    List<String> list;
    StringBuilder sb;
    Object[] oa;
    A(Date x, byte t) { System.out.println(d); d = x; }
    A(Map<String, String> x, byte t) { System.out.println(m); m = x; }
    A(List<String> x, byte t) { System.out.println(list); list = Collections.unmodifiableList(x); }
    A(List<String> x, short t) { System.out.println(list); list = x == null ? null : x; }
    A(StringBuilder x, byte t) { System.out.println(sb); sb = x; }
    A(Object[] x, byte t) { System.out.println(oa); oa = x; }
    A(Object[] x, short t) { System.out.println(oa); oa = x.clone(); }
}
