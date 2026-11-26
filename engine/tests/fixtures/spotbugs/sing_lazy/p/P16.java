package p;
public class P16 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P16(int a) {}
 P16() {}
 private static P16 I;
 public static P16 get() { if (I == null) { I = new P16(); } return I; }
 public static P16 other() { if (flag) { I = new P16(); } return I; }
}
