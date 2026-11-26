package p;
public class P6 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P6(int a) {}
 P6() {}
 private static P6 I;
 public static P6 get() { if (I == null) I = new P6(flag ? 1 : 2); return I; }
}
