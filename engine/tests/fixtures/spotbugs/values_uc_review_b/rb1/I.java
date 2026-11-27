package rb1;
public interface I {
    static void run2() {}
    default void dd(B2 b) {
        if (b.f > 3) { return; }
        dd2();
        if (b.f > 3) { System.out.println("z"); }
    }
    default void dd2() { }
}
