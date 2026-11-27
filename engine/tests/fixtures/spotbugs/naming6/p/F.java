package p;

public class F {
    public static final int MixedCase = 1;
    public static final Object ObjFinal = new Object();
    public final int InstFinal = 2;
    protected int ProtField;
    public int A;
    public int AB;
    public int ABc;
    public int Ab;
    public int A_b;
    public int Ab_Cd;
    public int _Ab;
    public int Ünicode;
    public static int StaticPub;
    protected static int StaticProt;
    public transient int TransPub;
    public volatile int VolPub;
    public int ΔDelta;
    public int $Ab;
    public int A1;
    public int A1b;

    public void M() {}
    public void Mm() {}
    public void MM() {}
    public void Mm_() {}
    protected void Prot() {}
    public static void PubStatic() {}
    public synchronized void Sync() {}
    public final void Fin() {}
    public void A1b() {}
    public void _Mm() {}
    public void
        Multi() {
        int x = 1;
        System.out.println(x);
    }
    public native void Nat();
    public abstract static class Ab2 {
        public abstract void Abs();
    }
    public interface I {
        void IfaceAbs();
        default void IfaceDef() {}
        static void IfaceStatic() {}
    }
    public static class Impl implements I {
        public void IfaceAbs() {}
    }
    public static class Sub extends Ab2 {
        public void Abs() {}
        public void Upper() {}
    }
    public static class Sub2 extends Sub {
        public void Upper() {}
    }
    static class PkgNested {
        public void PubInPkg() {}
        public int PubFieldInPkg;
    }
    private static class PrivNested {
        public void PubInPriv() {}
    }
    public enum En {
        X;
        public void EnumM() {}
        public int EnumF;
    }
    public record Rec(int Comp, int lower) {}
    public void Deprecated1() {}
    @Deprecated public void Deprecated2() {}
}
