package p;

public class B {
    static class G {}
    G g;
    String s;
    B(G x, byte t) { System.out.println(s); }
    B(String x, byte t) { System.out.println(g); }
}
