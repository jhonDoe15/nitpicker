package p;
public abstract class Z {
    private static final Z INSTANCE = new Z() {
        @Override void run() {}
    };
    abstract void run();
    public static Z getInstance() { return INSTANCE; }
}
