import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@Target(ElementType.METHOD)
@interface MyAnnotationJ5Rc1 {}

record J5Rc1(@MyAnnotationJ5Rc1 int x) {
  // BUG: Diagnostic contains: RecordComponentAccessorAnnotationConflict
  public int x() {
    return this.x;
  }
}
