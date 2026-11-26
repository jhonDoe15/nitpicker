package p;
public class H7 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H7 I;
 public static H7 get() { for (int i = 0; i < 2; i++) { if (I == null) log(); } if (flag) I = new H7(); return I; }
}
