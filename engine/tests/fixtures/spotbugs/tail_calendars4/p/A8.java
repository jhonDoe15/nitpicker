package p;

import java.text.*;
import java.util.*;

public class A8 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m(Date d) { X.format(d); }
    static String o(Date d) { return X.format(d); }
}
