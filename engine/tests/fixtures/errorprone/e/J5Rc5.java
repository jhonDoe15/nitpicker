import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@Target({ElementType.METHOD, ElementType.RECORD_COMPONENT})
@interface MyAnnotationJ5Rc5 {}

record J5Rc5(@MyAnnotationJ5Rc5 int x) {}
