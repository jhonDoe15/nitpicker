package p;

import java.text.*;
import java.util.*;

public class A1 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m(Date d) { X.format(d); }
    synchronized void s() { }
}
