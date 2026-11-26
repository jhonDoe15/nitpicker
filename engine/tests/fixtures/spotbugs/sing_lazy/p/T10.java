package p;
public class T10 implements java.io.Serializable {
 private static T10 I; static final Object LOCK = new Object();
 public static T10 a() { synchronized (LOCK) { if (I == null) I = new T10(); } return I; }
}
