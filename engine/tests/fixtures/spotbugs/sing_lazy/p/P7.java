package p;
public class P7 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P7(int a) {}
 P7() {}
 private static P7 I;
 public static P7 get() { if (I == null) { I = new P7(); log(); } return I; }
}
