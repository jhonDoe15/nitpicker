import java.util.regex.Pattern;

public class F44Ip1 {
  public static final String INVALID = "*";

  {
    Pattern.matches("[^\\]", "");
    Pattern.matches("[a-z", "");
    Pattern.matches("{", "");
    Pattern.matches(INVALID, "");
    "".matches(INVALID);
    "".replaceAll(INVALID, "");
    "".replaceFirst(INVALID, "");
    "".split(INVALID);
    "".split(INVALID, 0);
  }

  public void foo(String x) {
    Pattern.compile("t");
    Pattern.compile("t", 0);
    Pattern.matches("t", "");
    "".matches("t");
    "".replaceAll("t", "");
    "".replaceFirst("t", "");
    "".split("t");
    "".split("t", 0);
    Pattern.compile(x);
    Pattern.compile(x, 0);
    Pattern.matches(x, "");
    "".matches(x);
    "".replaceAll(x, "");
    "".replaceFirst(x, "");
    "".split(x);
    "".split(x, 0);
  }
}
