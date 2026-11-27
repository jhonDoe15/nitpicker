package p;
public class J5 extends Base implements If {
    String s;
    J5(int t, Object ot) {
        J5 other = (J5) ot; Base b = this; b.setup(); System.out.println(s);
    }
    J5(int t) { }
    void init() {}
}
