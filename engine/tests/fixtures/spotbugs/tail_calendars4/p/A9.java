package p;

import java.text.*;
import java.util.*;

public class A9 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m(Date d) { X.format(d); }
    static synchronized void s() { }
}
