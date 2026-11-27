import com.google.common.base.Splitter;
import java.util.regex.Pattern;

public class F44Ip2 {
  private static final String PREFIX = "(?<name>";
  private static final int FLAGS = Pattern.CASE_INSENSITIVE | Pattern.COMMENTS;

  void calls(String text) {
    Pattern.compile("a{2,1}");
    Pattern.compile("(?<=a\\1)");
    Pattern.compile("(?<=x(?:a|bc)+)y");
    Pattern.compile("[a-z&&]");
    Pattern.compile("[b-a]");
    Pattern.compile("\\p{IsLatn}\\p{InBasicLatin}\\p{sc=Greek}\\p{Foo}");
    Pattern.compile("\\p{blk=Nowhere}");
    Pattern.compile("(?<a>x)(?<a>y)");
    Pattern.compile("\\k<b>");
    Pattern.compile("\\x{110000}");
    Pattern.compile("\\N{}");
    Pattern.compile("a\\");
    Pattern.compile("\\Qa*\\E{");
    Pattern.compile("\tx)");
    Pattern.compile(")");
    Pattern.compile("a  # comment\n  *+*", Pattern.COMMENTS);
    Pattern.compile("a  # comment\n  *+*", FLAGS);
    Pattern.compile("a  # comment\n  *+*", 0);
    Pattern.compile("(?x) a # b {", Pattern.LITERAL);
    Pattern.compile("[", Pattern.LITERAL | Pattern.COMMENTS);
    Pattern.compile(PREFIX + "x)\\k<nam>");
    Pattern.compile("é😀(");
    Pattern.compile("(?i)[\\u0130-\\u0131&&]");
    Pattern.compile("\\b{g");
    Pattern.compile("\\cA\\c");
    text.split("|*");
    text.split("[", 2);
    text.matches("\\y");
    Splitter.onPattern("(?");
    Pattern.matches("(?$)", text);
  }
}
