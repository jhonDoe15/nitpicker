import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@Target({ElementType.METHOD, ElementType.PARAMETER})
@interface MyAnnotationJ5Rc11 {}

record J5Rc11(@MyAnnotationJ5Rc11 int x) {
  J5Rc11 {
    x = x;
  }
}
