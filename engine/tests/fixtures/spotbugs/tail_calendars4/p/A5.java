package p;

import java.text.*;
import java.util.*;

public class A5 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m(Date d) { X.format(d); }
    Runnable r() { return () -> { }; }
}
