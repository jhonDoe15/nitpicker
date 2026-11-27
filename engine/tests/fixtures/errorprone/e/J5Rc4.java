import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@Target({ElementType.METHOD, ElementType.RECORD_COMPONENT})
@interface MyAnnotationJ5Rc4 {}

record J5Rc4(@MyAnnotationJ5Rc4 int x) {
  @MyAnnotationJ5Rc4
  public int x() {
    return this.x;
  }
}
