package p;

import java.util.Date;

public class J {
    private final Date raw;
    private Date other;
    private Date[] arr;
    private final Date[] arrRaw;

    public J(Date raw, Date[] a) {
        this.raw = raw;
        this.arrRaw = a;
    }

    public void copy() {
        other = raw;
        arr = arrRaw;
    }
}
