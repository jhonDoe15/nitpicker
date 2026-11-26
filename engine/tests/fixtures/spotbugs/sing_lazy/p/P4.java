package p;
public class P4 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P4(int a) {}
 P4() {}
 private static P4 I;
 public static P4 get() { if (flag && I == null) I = new P4(); return I; }
}
