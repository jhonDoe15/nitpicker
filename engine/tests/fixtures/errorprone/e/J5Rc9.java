import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@Target(ElementType.PARAMETER)
@interface MyAnnotationJ5Rc9 {}

record J5Rc9(@MyAnnotationJ5Rc9 int x) {
  J5Rc9 {
    x = x;
  }
}
