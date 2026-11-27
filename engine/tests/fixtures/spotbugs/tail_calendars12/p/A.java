package p;
import java.text.*;
import java.util.*;
public class A {
    public static final DateFormat D = new SimpleDateFormat();
    void m1() { D.format(new Date()); Object o = D; ((DateFormat) o).format(new Date()); }
    void m2() { DateFormat o = D; o.format(new Date()); D.format(new Date()); }
    void m3() { DateFormat o = D; o.format(new Date()); DateFormat q = D; q.format(new Date()); }
    void m4() { DateFormat o = D; o.format(new Date()); o.format(new Date()); }
    void m5() { DateFormat o = D; o.format(new Date()); D.format(new Date()); D.format(new Date()); }
    void m6() { D.format(new Date()); D.format(new Date(), new StringBuffer(), null); }
    void m7() { DateFormat o = D; o.format(new Date()); o.format(new Date()); D.format(new Date());  }
}
