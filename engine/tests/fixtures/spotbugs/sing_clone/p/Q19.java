package p;
public class Q19 {
    private static final Q19 I = new Q19();
    public static Q19 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { throw new CloneNotSupportedException() { }; }
}
