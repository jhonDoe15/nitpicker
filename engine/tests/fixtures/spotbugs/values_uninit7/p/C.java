package p;

public class C {
    G g;
    C(G x, byte t) { System.out.println(g); }
    C(G x, short t) { System.out.println(g); g = x; }
}
class G {}
