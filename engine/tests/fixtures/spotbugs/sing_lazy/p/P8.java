package p;
public class P8 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P8(int a) {}
 P8() {}
 private static P8 I;
 public static P8 get() { if (I == null) { try { I = new P8(); } catch (RuntimeException e) { } } return I; }
}
