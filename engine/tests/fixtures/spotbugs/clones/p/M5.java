package p;
public class M5 implements Cloneable {
    int a;
    @Override
    public M5 clone() {
        return new M5();
    }
}
