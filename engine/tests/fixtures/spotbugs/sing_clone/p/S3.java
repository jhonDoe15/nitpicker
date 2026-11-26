package p;
public class S3 implements Cloneable {
    private static final S3 I = new S3();
    public static S3 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { throw (new CloneNotSupportedException()); }
}
