package p;
public class H16 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H16 I;
 public static H16 get() { if (I == null) { I = new H16(); } return I; }
 public static void other() { }
 public static H16 get2() { return I; }
}
