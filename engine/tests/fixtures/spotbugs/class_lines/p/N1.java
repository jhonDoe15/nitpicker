package p;
public class N1 implements Cloneable {
    int x;
    void m() {
        x++;
    }
    public native Object clone();
}
