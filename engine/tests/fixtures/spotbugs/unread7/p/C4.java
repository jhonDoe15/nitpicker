package p;

public class C4 implements java.io.Serializable {
    private int x;
    private transient int t;
    void s() { t = 1; }
    C4() {
        x = 1;
    }
}
