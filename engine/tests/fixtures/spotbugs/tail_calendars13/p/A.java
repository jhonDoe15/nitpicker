package p;
import java.text.*;
import java.util.*;
public class A {
    public static final SimpleDateFormat D = new SimpleDateFormat();
    public static final Calendar C = Calendar.getInstance();
    void m1() { D.format(new Date()); ((DateFormat) D).format(new Date()); }
    void m2() { D.format(new Date()); D.format((Object) new Date()); }
    void m3() { C.set(1, 2); C.set(1, 2, 3); C.set(1, 2, 3, 4, 5); C.set(1, 2); }
    void m4() { D.format(new Date()); D.format(1L); }
    void m5() { ((Format) D).format(new Date()); ((Format) D).format("x"); D.format(new Date()); }
}
