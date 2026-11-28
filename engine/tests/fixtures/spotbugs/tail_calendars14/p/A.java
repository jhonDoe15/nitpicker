package p;
import java.text.*;
import java.util.*;
public class A {
    public static final class Sub extends SimpleDateFormat {}
    public static Sub S1 = new Sub();
    public static Sub S2 = new Sub();
    void m1() { A.S1.format(new Date()); }
    void m2() { A.S1.toPattern(); }
    void m3() { Object o = A.S1; ((DateFormat) o).format(new Date()); }
    void m4() { Object o = S2; ((DateFormat) o).format(new Date()); A.S2.format(new Date()); }
    synchronized void m5() {}
}
