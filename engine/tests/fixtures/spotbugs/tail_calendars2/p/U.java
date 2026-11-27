package p;

import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.GregorianCalendar;
import java.util.TimeZone;

public class U {
    public static Calendar PC = Calendar.getInstance();
    protected static final Calendar PROT = Calendar.getInstance();
    public static final SimpleDateFormat PSDF = new SimpleDateFormat("y");
    public static final GregorianCalendar PGC = new GregorianCalendar();
    static final Calendar C = Calendar.getInstance();
    static final SimpleDateFormat F = new SimpleDateFormat("y");
    public static final Calendar PNUL = null;
    public final Calendar instPub = null;

    void c1() { C.get(Calendar.YEAR); }
    void c2() { C.set(Calendar.YEAR, 1); }
    void c3() { C.add(Calendar.YEAR, 1); }
    void c4() { C.getTime(); }
    void c5() { C.setTime(new Date()); }
    void c6() { C.clone(); }
    void c7() { C.getTimeInMillis(); }
    void c8() { C.setTimeInMillis(1); }
    void c9() { C.equals(null); }
    void c10() { C.hashCode(); }
    void c11() { C.toString(); }
    void c12() { C.before(null); }
    void c13() { C.compareTo(null); }
    void c14() { C.isLenient(); }
    void c15() { C.getTimeZone(); }
    void c16() { C.setTimeZone(null); }
    void c17() { C.getActualMaximum(1); }
    void c18() { C.getFirstDayOfWeek(); }
    void c19() { C.roll(1, 1); }
    void c20() { C.clear(); }
    void d1() throws Exception { F.parse("1"); }
    void d2() { F.format(new Date()); }
    void d3() { F.setLenient(true); }
    void d4() { F.getCalendar(); }
    void d5() { F.setTimeZone(TimeZone.getDefault()); }
    void d6() { F.getTimeZone(); }
    void d7() { F.clone(); }
    void d8() { F.equals(null); }
    void d9() { F.hashCode(); }
    void d10() { F.toString(); }
    void d11() { F.toPattern(); }
    void d12() { F.applyPattern("y"); }
    void d13() { F.getNumberFormat(); }
    void d14() { F.isLenient(); }
    void d15() { F.format(new Date(), new StringBuffer(), new java.text.FieldPosition(0)); }
    void d16() { F.format((Object) new Date()); }
    void d17() throws Exception { F.parseObject("1"); }
    void d18() { F.get2DigitYearStart(); }
    void d19() { F.getDateFormatSymbols(); }
    void d20() { F.toLocalizedPattern(); }
    void d21() { ((DateFormat) F).format(new Date()); }
    void e1() { PGC.setTime(new Date()); }
    void e2() { PROT.setTime(new Date()); }
}
