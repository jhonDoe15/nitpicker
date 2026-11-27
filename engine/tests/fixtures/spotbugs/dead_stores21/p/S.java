package p;
import java.util.*;
public class S {
    void a1(Object o) { String s; foo(s = o.toString()); }
    boolean a2(Object o) { String s; return (s = o.toString()) != null; }
    int a3(Object o) { String s; return (s = o.toString()).length(); }
    int a4(Integer x) { Integer a; return (a = x).intValue(); }
    int a5(List<String> l) { List<String> m; return (m = new ArrayList<>(l)).size(); }
    void a6(Object o) { String s; String t = (s = o.toString()); foo(t); }
    int a7() { StringBuilder b; return (b = new StringBuilder()).length(); }
    void a8() { StringBuilder b; (b = new StringBuilder()).append(1); }
    int a9(Object o) { Object s; return (s = o).hashCode(); }
    int a10(Object o) { String s; String t; return (t = (s = o.toString())).length(); }
    int a11(int[] xs) { int[] ys; return (ys = xs).length; }
    int a12(S o) { S s; return (s = o).f; }
    int f;
    void foo(Object x) {}
}
