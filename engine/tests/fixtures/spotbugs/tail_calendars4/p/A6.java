package p;

import java.text.*;
import java.util.*;

public class A6 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m(Date d) { X.format(d); }
    private static SimpleDateFormat lazy;
    String l(Date d) { if (lazy == null) lazy = new SimpleDateFormat("y"); return lazy.format(d); }
}
