package p;
public class C10 implements Marker {
    private static final C10 INSTANCE = new C10();
    private C10() {}
    public static C10 getInstance() { return INSTANCE; }
}
interface Marker extends java.io.Serializable {}
