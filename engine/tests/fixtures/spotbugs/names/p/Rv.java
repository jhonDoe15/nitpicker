package p;

import java.util.Date;
import java.util.List;
import java.util.Objects;

public class Rv {
    private Date a;
    private Date b;
    private Date c;
    private Date d;
    private Date e;

    public void copyOfCheck(Date p) {
        Date x = Objects.requireNonNull(p);
        this.a = x;
    }

    public void loopMerge(Date p, Date q, boolean go) {
        Date x = p;
        while (go) {
            x = q;
        }
        this.b = x;
    }

    public void storeInLoop(Date p, Date q, boolean go) {
        Date x = p;
        while (go) {
            this.c = x;
            x = q;
        }
    }

    public void sibling(Date p, List<Date> list) {
        for (Date t : list) {
            t.getTime();
        }
        Date u = p;
        Date t = p;
        p = null;
        this.d = t;
    }

    public void pattern(Object o, Date p, String s) {
        if (s != null && o instanceof Date z) {
            z.getTime();
        }
        Date u = p;
        p = null;
        this.e = u;
    }
}
