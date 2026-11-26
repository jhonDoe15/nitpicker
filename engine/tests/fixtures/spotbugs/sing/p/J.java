package p;
public class J {
    private static final J INSTANCE = new J();
    protected J() {}
    public static J getInstance() { return INSTANCE; }
}
