package p;

import java.text.*;
import java.util.*;

public class A7 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m(Date d) { X.format(d); }
    public static final DateFormat DF = DateFormat.getDateInstance();
}
