

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;

public class F43Fa12 {
  @FormatMethod
  public void log(@FormatString String s, Object... args) {}

  public void callLog(String s, Object... args) {
    verify(this).log(any(String.class), eq(args));
  }
}
