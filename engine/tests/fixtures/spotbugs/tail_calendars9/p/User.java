package p;
import java.text.*;
import java.util.*;
import java.util.function.*;
public class User extends Holder implements Holder.I {
    public String a() { return DF.format(new Date()); }
    public String b() { return IF.format(new Date()); }
    public Supplier<String> c() { return () -> DF.format(new Date()); }
    public synchronized Supplier<String> d() { return () -> DF.format(new Date()); }
    public Function<Date,String> e() { return DF::format; }
    public String f() { return ((DateFormat) Holder.DF).format(new Date()); }
    public void g() { Holder.CAL.add(Calendar.DAY_OF_MONTH, 1); GC.set(2000, 1, 1); Holder.Nested.NC.clear(); }
    public String h() { return Holder.E.F.format(new Date()); }
    public String i() { SimpleDateFormat x = DF; x = new SimpleDateFormat(); return x.format(new Date()); }
    public String j() { var x = DF; return x.format(new Date()); }
    public void k() { DF.setLenient(false); DF.setLenient(true); DF.setLenient(false); DF.parse("x", new ParsePosition(0)); DF.parse("x", new ParsePosition(0)); }
    public Object l() { return ARR[0].format(new Date()); }
    public Object m() { Runnable r = new Runnable() { public void run() { DF.format(new Date()); } }; return r; }
    public <T extends DateFormat> void n(T t) { DF.applyPattern("x"); DF.toPattern(); DF.hashCode(); DF.toString(); DF.clone(); DF.getTimeZone(); DF.isLenient(); }
    public void o() { synchronized (this) { DF.format(new Date()); } Runnable r = () -> { synchronized (this) { DF.format(new Date()); } }; }
    public void q() { Object o = LST.get(0); DF.setCalendar(CAL); CAL.setTime(new Date()); CAL.after(null); CAL.compareTo(null); }
    static { DF.format(new Date()); }
    { DF.format(new Date()); }
    Object fld = DF.format(new Date());
    public User() { DF.format(new Date()); }
}
