package p;
public class P11 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P11(int a) {}
 P11() {}
 private static P11 I;
 public static P11 get() { if (I == null) { I = new P11(); } else { log(); } return I; }
}
