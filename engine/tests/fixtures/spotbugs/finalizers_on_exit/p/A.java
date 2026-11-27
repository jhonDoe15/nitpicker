package p;

public class A {
    @SuppressWarnings("deprecation")
    void a() {
        System.runFinalizersOnExit(true);
        Runtime.runFinalizersOnExit(false);
    }

    @SuppressWarnings("deprecation")
    static void b() {
        System.runFinalizersOnExit(true);
    }
}
