import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@Target(ElementType.PARAMETER)
@interface MyAnnotationJ5Rc8 {}

record J5Rc8(@MyAnnotationJ5Rc8 int x) {}
