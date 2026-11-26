package p;
public class G17 implements java.io.Serializable {
 private static G17 I = Boolean.getBoolean("x") ? new G17() : null;
 public static G17 get() { return I; }
}
