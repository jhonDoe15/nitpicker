package p;

import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.GregorianCalendar;

public class S {
    private static final SimpleDateFormat SDF = new SimpleDateFormat("yyyy");
    public static final DateFormat DF = DateFormat.getDateInstance();
    static Calendar CAL = Calendar.getInstance();
    private static final GregorianCalendar GC = new GregorianCalendar();
    private static SimpleDateFormat lazy;
    private static final ThreadLocal<SimpleDateFormat> TL = ThreadLocal.withInitial(() -> new SimpleDateFormat("y"));
    private static final Object OBJ = new SimpleDateFormat("y");
    private static final java.text.Format FMT = new SimpleDateFormat("y");
    private final SimpleDateFormat inst = new SimpleDateFormat("y");
    private static final SimpleDateFormat[] ARR = { new SimpleDateFormat("y") };
    private static final SimpleDateFormat NUL = null;
    private static final SimpleDateFormat UNUSED = new SimpleDateFormat("y");

    String f1(Date d) { return SDF.format(d); }
    String f2(Date d) { return DF.format(d); }
    int f3() { return CAL.get(Calendar.YEAR); }
    int f4() { return GC.get(Calendar.YEAR); }
    String f5(Date d) { synchronized (SDF) { return SDF.format(d); } }
    synchronized String f6(Date d) { return SDF.format(d); }
    static synchronized String f7(Date d) { return SDF.format(d); }
    String f8(Date d) { if (lazy == null) lazy = new SimpleDateFormat("y"); return lazy.format(d); }
    String f9(Date d) { return TL.get().format(d); }
    String f10(Date d) { SimpleDateFormat l = SDF; return l.format(d); }
    String f11(Date d) { return ((SimpleDateFormat) SDF.clone()).format(d); }
    String f12(Date d) { return SDF.toPattern(); }
    void f13() { CAL.setTime(new Date()); }
    String f14(Date d) { return inst.format(d); }
    String f15(Date d) { return FMT.format(d); }
    String f16(Date d) { return SDF.format(d) + SDF.format(d); }
    Runnable f17(Date d) { return () -> SDF.format(d); }
}
