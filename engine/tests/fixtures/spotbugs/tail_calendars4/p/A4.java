package p;

import java.text.*;
import java.util.*;

public class A4 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m(Date d) { X.format(d); }
    private static final ThreadLocal<String> TL = new ThreadLocal<>();
}
