package p;
public class J4 extends Base implements If {
    String s;
    J4(int t, Object ot) {
        J4 other = (J4) ot; If i = this; i.dm(); System.out.println(s);
    }
    J4(int t) { }
    void init() {}
}
