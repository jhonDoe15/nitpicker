package p;
import java.text.*;
import java.util.*;
public class B {
    public static final DateFormat[] F1 = new DateFormat[1];
    static final class Gen<T extends DateFormat> { public static DateFormat x; }
    public static Calendar C = null;
    public static final Calendar C0 = null;
    public static final SimpleDateFormat SD = null;
    public static final java.sql.Timestamp TS = null;
    public static final java.sql.Date SQ = null;
    public static final Date DT = null;
    public static final TimeZone TZ = null;
    public static final java.time.format.DateTimeFormatter DTF = null;
    public static final Object[] OA = {};
    void m() { synchronized (this) {} }
    void use() { F1[0].format(new Date()); DateFormat d = F1[0]; d.format(new Date()); Object o = A.S1; ((DateFormat) o).format(new Date()); A.S1.format(new Date()); A.S1.toPattern(); }
}
