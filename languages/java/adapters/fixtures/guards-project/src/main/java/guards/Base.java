package guards;

@MappedSuperclass
public abstract class Base {
  protected Long id;

  public static final class Leaf {
    protected int size; // violation: checkstyle/VisibilityModifier
  }
}
