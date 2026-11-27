package p;

import java.text.*;
import java.util.*;

public class Std extends DateFormat {
    public final static Std instance = new Std();
    protected final static DateFormat RFC;
    public static final SimpleDateFormat PLAIN = new SimpleDateFormat("y");
    public static final MyCal MC = new MyCal();
    static { RFC = new SimpleDateFormat("y"); }
    @Override public StringBuffer format(Date d, StringBuffer b, FieldPosition p) { return b; }
    @Override public Date parse(String s, ParsePosition p) { return null; }
    static class MyCal extends GregorianCalendar { }
}
