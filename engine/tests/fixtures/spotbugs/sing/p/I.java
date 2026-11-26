package p;
public class I {
    private static final I FIRST = new I();
    private static final I SECOND = new I();
    I() {}
    public static I first() { return FIRST; }
    public static I second() { return SECOND; }
}
