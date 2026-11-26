package p;
public class H9 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H9 I;
 public static H9 get() { if (I == null) { I = new H9(); } return I; }
 public static void reset() { I = null; }
}
