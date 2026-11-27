package p;
public class J1 extends Base implements If {
    String s;
    J1(int t, Object ot) {
        J1 other = (J1) ot; setup(); System.out.println(s);
    }
    J1(int t) { }
    void init() {}
}
