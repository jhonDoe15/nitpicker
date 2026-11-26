package p;
public class A {
    public static int f1 = 1;
    public static int f2 = 1;
    public static int f3 = 1;
    public static int f4;
    static { f4 = 4; }
    public static int f5;
    static { int q = f5; f5 = 4; }
    public static int f6;
    static { f6 = 4; int q = f6; }
}
