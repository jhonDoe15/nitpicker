package d;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;

public class Folding<K extends HashMap<String, String>> {

    static final SimpleDateFormat FORMAT = new SimpleDateFormat("yyyy");
    static final String HALF = "a" + 1.5f;
    static Folding single;

    static class Other {
        final String inst = "o";
        static final String KEPT = "k";
    }

    final String inst = "i";

    void floats(String x) {
        if (x.equals("" + 1.5f)) { }
        if (x.equals("" + 1e10)) { }
        if (x.equals("" + 1e-5)) { }
        if (x.equals("" + (1 / 0.0))) { }
        if (x.equals(HALF)) { }
        if (x.equals(Long.MAX_VALUE + "")) { }
        if (x.equals("" + Character.MIN_VALUE)) { }
        if (x.equals("" + Double.MIN_VALUE)) { }
    }

    void appends(StringBuilder sb, Other o) {
        sb.append("a" + 1e10);
        sb.append("a" + 0.1f);
        sb.append("" + Long.MAX_VALUE);
        sb.append("a" + Math.PI);
        sb.append(o.inst + "z");
        sb.append(this.inst + "z");
        sb.append(inst + "z");
        sb.append(Other.KEPT + "z");
    }

    void fields(String x, Other o) {
        if (x.equals(new Other().inst)) { }
        if (x.equals(o.inst)) { }
        if (x.equals(Other.KEPT)) { }
    }

    void typed(K k) { }

    <T extends ArrayList<String>> T generic(T t) {
        return t;
    }

    void format() {
        Folding.FORMAT.format(new Date());
        synchronized (Folding.FORMAT) {
            Runnable r = () -> Folding.FORMAT.format(new Date());
        }
    }

    static Folding getInstance(Folding given) {
        return given;
    }

    static Folding instance() {
        if (single == null) {
            single = new Folding();
        }
        return single;
    }

    record Kept(int[] data) {
        int[] copy() {
            return data;
        }

        public int[] data() {
            return data;
        }
    }
}
