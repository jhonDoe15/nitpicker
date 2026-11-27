package p;

import java.text.*;
import java.util.*;

public class M1 {
    private static final SimpleDateFormat X = new SimpleDateFormat("y");
    void m() throws Exception { X.format(new Date()); }
    void n() { X.format(new Date()); }
}
