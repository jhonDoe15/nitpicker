package p;

import java.text.*;
import java.util.*;

public class B0 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m(Date d) { X.format(d); }
    void k() throws Exception { X.toPattern(); }
}
