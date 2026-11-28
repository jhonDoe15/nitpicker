package p;

public class A {
    static class G {}
    String s;
    A(byte t, G x) { System.out.println(s); }
    A(T.X x, byte t) { System.out.println(s); }
    A(java.util.Map.Entry<String, String> x, byte t) { System.out.println(s); }
    A(A x, byte t) { System.out.println(s); }
    A(G[] x, byte t) { System.out.println(s); }
    class In {
        String w;
        In(byte t) { System.out.println(w); }
        In(T x) { System.out.println(w); }
    }
}
