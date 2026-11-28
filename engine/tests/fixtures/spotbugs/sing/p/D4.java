package p;
public class D4 extends Base5 {
    private static final D4 INSTANCE = new D4();
    private D4() {}
    public static D4 getInstance() { return INSTANCE; }
}
class Base5 implements Cloneable {}
