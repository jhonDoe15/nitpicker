package p;
public class G19 {
    String s;
    int h;
    G19(int t) {
        try { t = Integer.parseInt("1"); } catch (RuntimeException e) { System.out.println(s); }
    }
}
