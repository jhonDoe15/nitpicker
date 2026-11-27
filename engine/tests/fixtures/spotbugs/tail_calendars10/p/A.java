package p;
import java.text.*;
import java.util.*;
public class A {
    public static SimpleDateFormat DF = new SimpleDateFormat("yyyy");
    public static Calendar[] CA = new Calendar[2];
    public static SimpleDateFormat[][] DD = null;
    static { DF.format(new Date()); }
    static class In { static { DF.format(new Date()); } static String x = DF.format(new Date()); }
    static String sf = DF.format(new Date());
    static String sg() { return DF.format(new Date()); }
}
