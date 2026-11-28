import com.google.common.base.Preconditions;
import com.google.common.base.Verify;
import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;
import java.io.PrintStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

class S21ExpensiveLenient {
  void positive(Object o) {
    int foo = 42;
    int bar = 78;
    Preconditions.checkState(true, String.format("The foo %s (%s) is not a good foo", foo, bar));
    Preconditions.checkNotNull(o, String.format("%s%%s", o));
    Verify.verify(true, String.format("%s", foo));
    Preconditions.checkArgument(true, String.format("plain"));
  }

  void negative(Object o) {
    int foo = 42;
    Preconditions.checkState(true, "The foo %s foo  is not a good foo", foo);
    Preconditions.checkState(true, String.format("The foo %d foo is not a good foo", foo));
    Preconditions.checkState(true, String.format("100%", foo));
    Preconditions.checkState(true, String.format("%%d", foo));
    Preconditions.checkState(true);
    Preconditions.checkState(true, "The foo" + foo + " is not a good foo");
    Preconditions.checkNotNull(o, String.format(Locale.ROOT, "%s", foo));
    Preconditions.checkNotNull(o, String.format(o.toString(), foo));
    Preconditions.checkNotNull(o, o.toString());
  }

  @SuppressWarnings("ExpensiveLenientFormatString")
  void suppressed(int foo) {
    Preconditions.checkState(true, String.format("The foo %s", foo));
  }
}

class S21Placeholders {
  private static final String STRING_CONST = "string constant";

  void verify(int i, Object o) {
    Verify.verify(false, "Raspberry " + i + " irradiates " + o);
    Verify.verifyNotNull(o, o + " is null");
    Verify.verify(false, "%s" + i);
    Verify.verify(false, "%s%s" + i);
  }

  void preconditions(int i, Object o) {
    Preconditions.checkArgument(false, "Raspberry " + i + " irradiates " + o);
    Preconditions.checkArgument(false, "Concat " + i + " and argument %s", o);
    Preconditions.checkArgument(false, i + " begin and argument %s", o);
    Preconditions.checkArgument(false, "Argument %s and concat " + i, o);
    Preconditions.checkArgument(false, "How about %s the middle " + i + " as well %s?", o, o);
    Preconditions.checkArgument(false, "But string concat %s " + "string is ok", i);
    Preconditions.checkArgument(false, "And string concat " + STRING_CONST + " is ok");
    Preconditions.checkState(false, i + " defenestrates " + o);
    Preconditions.checkNotNull(o);
    Preconditions.checkState(o != null, "a" + String.valueOf(o).substring(1, 2) + i);
    Preconditions.checkState(o != null, ("a" + i) + "b");
  }

  void formats(PrintStream out, int i, Object o, String name) {
    out.printf("Value " + i + " is bad");
    out.printf(Locale.ROOT, "Value " + i + " is bad");
    String.format("Value " + i + " is bad: %s", o);
    String formatted = ("Value " + i + " is bad").formatted();
    String.format("%s" + name, o);
    out.println("Value " + i);
    out.format("Value %s " + i + "%s", o, o);
  }

  @FormatMethod
  void custom(String format, Object... args) {}

  @FormatMethod
  void second(int unused, @FormatString String format, Object... args) {}

  void annotated(int i, Object o) {
    custom("Value " + i + " is bad");
    second(1, "Value " + i + " is bad");
  }

  void negativeElementIndex(int i, int j) {
    Preconditions.checkElementIndex(i, j + 10, "a" + i);
    Preconditions.checkPositionIndex(i, j + 10, "a" + i);
  }

  void negativeVarargs(int i, String moreFormat, Object moreArgs) {
    List<Object> args = new ArrayList<>();
    args.add(i);
    Preconditions.checkArgument(false, String.format("%s: %s" + moreFormat, args.toArray()));
    Preconditions.checkArgument(false, "%s: %s" + moreFormat, args.toArray());
  }

  @SuppressWarnings("FormatStringShouldUsePlaceholders")
  void suppressed(int i) {
    Preconditions.checkState(true, "a" + i);
  }
}
