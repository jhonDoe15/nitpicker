package p;
import java.text.*;
import java.util.*;
import java.util.function.*;
public class Holder {
    public static SimpleDateFormat DF = new SimpleDateFormat("yyyy");
    public static final Calendar CAL = Calendar.getInstance();
    public static GregorianCalendar GC = new GregorianCalendar();
    public static DateFormat[] ARR = new DateFormat[1];
    public static List<DateFormat> LST = new ArrayList<>();
    public static Object OBJ = new SimpleDateFormat();
    public enum E { A; public static SimpleDateFormat F = new SimpleDateFormat(); public String m() { return F.format(new Date()); } }
    public interface I { SimpleDateFormat IF = new SimpleDateFormat(); }
    public static class Nested { public static Calendar NC = Calendar.getInstance(); }
}
