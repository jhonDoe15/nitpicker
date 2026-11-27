package p;

import java.text.*;
import java.util.*;

public class P {
    static final SimpleDateFormat X = new SimpleDateFormat("y");
    static final SimpleDateFormat Y = new SimpleDateFormat("y");
    static final Calendar C = Calendar.getInstance();
    void a(Date d) {
        X.toPattern();
        X.format(d);
    }
    void b(Date d) {
        X.format(d);
        Y.format(d);
    }
    void c(Date d) {
        X.format(d);
        C.setTime(d);
    }
    void e(Date d) {
        X.format(d);
        X.format(d);
    }
    void f(Date d, boolean k) { SimpleDateFormat l = k ? X : new SimpleDateFormat("y"); l.format(d); }
    void g(Date d) { SimpleDateFormat l = X; l = new SimpleDateFormat("y"); l.format(d); }
    void h(Date d) { SimpleDateFormat l = new SimpleDateFormat("y"); l = X; l.format(d); }
    SimpleDateFormat get() { return X; }
    void i(Date d) { get().format(d); }
    void j(Date d) { X.getCalendar().setTime(d); }
    void k(Date d) { new P().format2(d); }
    void format2(Date d) { }
    void m(Date d) { DateFormat df = X; df.format(d); }
    void n(Date d) { Object o = X; ((DateFormat) o).format(d); }
    void o(Date d) {
        X.toPattern();
        X.toLocalizedPattern();
    }
    void q(Date d) {
        X.hashCode();
        X.toPattern();
        X.format(d);
        X.format(d);
    }
}
