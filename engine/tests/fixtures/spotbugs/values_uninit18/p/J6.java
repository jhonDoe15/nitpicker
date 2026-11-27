package p;
public class J6 extends Base implements If {
    String s;
    J6(int t, Object ot) {
        J6 other = (J6) ot; J6 j = this; j.init(); System.out.println(s);
    }
    J6(int t) { }
    void init() {}
}
