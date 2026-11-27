package p;
public class J0 extends Base implements If {
    String s;
    J0(int t, Object ot) {
        J0 other = (J0) ot; other.init(); System.out.println(s);
    }
    J0(int t) { }
    void init() {}
}
