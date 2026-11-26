package p;
public class C13 {
    private static volatile C13 instance;
    public C13() {}
    public static C13 get() {
        C13 local = instance;
        if (local == null) {
            synchronized (C13.class) {
                local = instance;
                if (local == null) {
                    instance = local = new C13();
                }
            }
        }
        return local;
    }
}
