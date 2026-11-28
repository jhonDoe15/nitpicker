package p;
public class G28 implements java.io.Serializable {
 private static G28 I;
 public static G28 get() { synchronized (G28.class) { if (I == null) I = new G28(); return I; } }
}
