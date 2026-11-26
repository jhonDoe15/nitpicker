package p;
public enum D7 {
    ONE;
    private static final D7 DEFAULT = ONE;
    public static D7 get() { return DEFAULT; }
}
