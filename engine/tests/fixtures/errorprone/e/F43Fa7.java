

import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;

public class F43Fa7 {
  @FormatMethod
  // BUG: Diagnostic contains: A method cannot have more than one @FormatString
  void log1(@FormatString String s1, @FormatString String s2) {}

  @FormatMethod
  // BUG: Diagnostic contains: An @FormatMethod must contain at least one String
  void log2(Object o) {}

  @FormatMethod
  // BUG: Diagnostic contains: Only strings can be annotated @FormatString.
  void log3(@FormatString Object o) {}

  // BUG: Diagnostic contains: A parameter can only be annotated @FormatString in a
  void log4(@FormatString Object o) {}
}
