package p;
public class Bn extends Vn {
    final static Bn EMPTY = new Bn(new byte[0]);
    protected final byte[] _data;
    public Bn(byte[] d) { _data = d; }
    public static Bn valueOf(byte[] data) {
        if (data == null) { return null; }
        if (data.length == 0) { return EMPTY; }
        return new Bn(data);
    }
    public static Bn simple() { return EMPTY; }
}
abstract class Vn { Object writeReplace() { return null; } }
