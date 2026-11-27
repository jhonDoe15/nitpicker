package p;

import java.text.*;
import java.util.*;

public class H {
    static final SimpleDateFormat X = new SimpleDateFormat("y");
    static final Calendar CAL = Calendar.getInstance();
    static final Object LOCK = new Object();
    public static final Calendar PUBCAL = Calendar.getInstance();
    static { X.setLenient(false); CAL.setLenient(false); }
    { X.setLenient(true); }
    H() { X.setLenient(false); }
    synchronized void sync() { }
    void a(Date d) { synchronized (this) { X.format(d); } }
    void b(Date d) { synchronized (LOCK) { X.format(d); } }
    void c(Date d) { synchronized (LOCK) { } X.format(d); }
    void e(Date d) { synchronized (X) { CAL.setTime(d); } }
    void f(Date d) { X.format(d); }
    class Inner { void g(Date d) { X.format(d); } }
    static class Nested { void h(Date d) { X.format(d); } }
    Runnable r(Date d) { return () -> X.format(d); }
    void i(Date d) { try { X.format(d); } finally { } }
}
