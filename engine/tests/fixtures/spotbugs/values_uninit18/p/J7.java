package p;
public class J7 extends Base implements If {
    String s;
    J7(int t, Object ot) {
        J7 other = (J7) ot; this.equals(other); System.out.println(s);
    }
    J7(int t) { }
    void init() {}
}
