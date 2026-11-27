package p;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;

public class T {
    static String other(Date d) { return S.DF.format(d); }
    static final Calendar C2;
    static { C2 = Calendar.getInstance(); C2.setLenient(false); }
    static final SimpleDateFormat INIT = new SimpleDateFormat("y");
    static { INIT.setLenient(false); }
    int g() { return C2.get(Calendar.YEAR); }
}
