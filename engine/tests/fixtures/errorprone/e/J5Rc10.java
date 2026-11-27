import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@Target({ElementType.METHOD, ElementType.PARAMETER})
@interface MyAnnotationJ5Rc10 {}

record J5Rc10(@MyAnnotationJ5Rc10 int x) {
  public int x() {
    return this.x;
  }
}
