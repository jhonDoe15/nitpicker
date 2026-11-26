package p;
public class C12 {
    public static final C12 A = new C12(), B = new C12();
    public C12() {}
    public static C12 pick(int i) { return i == 0 ? A : B; }
}
