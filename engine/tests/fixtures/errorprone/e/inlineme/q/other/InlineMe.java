package ivq.other;
import java.lang.annotation.*;
@Retention(RetentionPolicy.RUNTIME)
public @interface InlineMe { String replacement(); String[] imports() default {}; String[] staticImports() default {}; }
