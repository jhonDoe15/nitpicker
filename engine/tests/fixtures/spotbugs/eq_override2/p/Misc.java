package p;
import q.*;
public class Misc {
    public static class T1 extends Trivial { int f; }
    public static class T2 extends Throws { int f; }
    public static class T3 extends Deprecated1 { int f; }
    public static class T4 extends Sync { int f; }
    public static class T5 extends AbstractEqBase { int f; }
    public static abstract class T6 extends AbstractEqBase { int f; }
    public static class T7 extends Pub { int f; }
    public static class T8 extends Native.SubIn { int g; }
}
