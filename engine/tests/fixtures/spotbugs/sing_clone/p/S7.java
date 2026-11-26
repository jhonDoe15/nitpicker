package p;
public class S7 implements IC {
    private static final S7 I = new S7();
    public static S7 get() { return I; }
    protected S7 clone() throws CloneNotSupportedException { return (S7) super.clone(); }
}
