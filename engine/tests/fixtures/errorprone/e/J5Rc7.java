import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@Target(ElementType.PARAMETER)
@interface MyAnnotationJ5Rc7 {}

record J5Rc7(@MyAnnotationJ5Rc7 int x) {
  // BUG: Diagnostic contains: RecordComponentAccessorAnnotationConflict
  J5Rc7(int x) {
    this.x = x;
  }
}
