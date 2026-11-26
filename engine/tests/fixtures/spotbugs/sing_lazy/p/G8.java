package p;
public class G8 implements java.io.Serializable {
 private static volatile G8 I;
 public static G8 get() { if (I == null) { synchronized (G8.class) { if (I == null) I = new G8(); } } return I; }
}
