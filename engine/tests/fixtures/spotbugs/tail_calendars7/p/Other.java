package p;

import java.text.*;
import java.util.*;

public class Other {
    public static final Std S2 = new Std();
    static final Calendar C = Calendar.getInstance();
    volatile int v;
    void m(Date d) { C.setTime(d); Std.instance.format(d); }
}
