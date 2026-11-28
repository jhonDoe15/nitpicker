package p;

import java.text.*;
import java.util.*;

public class B2 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m(Date d) { X.format(d); }
    private final SimpleDateFormat inst = new SimpleDateFormat("y");
    void i(Date d) { inst.format(d); }
}
