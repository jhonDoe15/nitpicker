package p;
import java.lang.annotation.*;
import javax.annotation.CheckForNull;
import javax.annotation.meta.TypeQualifierNickname;
@Documented
@TypeQualifierNickname
@CheckForNull
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.PARAMETER, ElementType.FIELD, ElementType.METHOD })
public @interface Nullable {}
