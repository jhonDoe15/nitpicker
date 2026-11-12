package shop;

import java.util.List;
import java.util.regex.Pattern;

public final class Regexes {
  private static final String SEPARATOR = ",";
  private static final String NAMES = String.join("|", List.of("a", "b"));
  private static final Pattern WORD = Pattern.compile("\\w+");
  private final String delimiter;

  public Regexes(String delimiter) {
    this.delimiter = delimiter;
  }

  public String[] splitParameter(String line, String separator) {
    return line.split(separator); // violation: UnquotedRegexValue
  }

  public String[] splitField(String line) {
    return line.split(delimiter); // violation: UnquotedRegexValue
  }

  public String[] splitThisField(String line) {
    return line.split(this.delimiter, 2); // violation: UnquotedRegexValue
  }

  public boolean matchesConcat(String line, String prefix) {
    return line.matches(prefix + "\\d+"); // violation: UnquotedRegexValue
  }

  public String replaceAll(String line, String word) {
    return line.replaceAll(word, ""); // violation: UnquotedRegexValue
  }

  public String replaceFirst(String line, String word) {
    return line.replaceFirst("^" + word, ""); // violation: UnquotedRegexValue
  }

  public Pattern compileConcat(String name) {
    return Pattern.compile("^/" + name + "/\\d+$"); // violation: UnquotedRegexValue
  }

  public boolean patternMatches(String name, String line) {
    return Pattern.matches(name + ".*", line); // violation: UnquotedRegexValue
  }

  public List<Pattern> lambda(List<String> names) {
    return names.stream().map(name -> Pattern.compile("^" + name)).toList(); // violation: UnquotedRegexValue
  }

  public String replaceAllPlain(String content) {
    String joined = content.replaceAll("\r", ""); // violation: PlainTextRegex
    return joined.replaceAll("\n", ""); // violation: PlainTextRegex
  }

  public String replaceAllPlainConstant(String content) {
    return content.replaceAll(SEPARATOR, ";"); // violation: PlainTextRegex
  }

  public String[] splitConstant(String line) {
    return line.split(SEPARATOR);
  }

  public String[] splitLiteral(String line) {
    return line.split("\\s*,\\s*");
  }

  public String[] splitQuoted(String line, String separator) {
    return line.split(Pattern.quote(separator));
  }

  public String[] splitQuotedConcat(String line, String separator) {
    return line.split(Pattern.quote(separator) + "\\s*");
  }

  public Pattern compileWhole(String pattern) {
    return Pattern.compile(pattern);
  }

  public Pattern compileWholeFlags(String pattern) {
    return Pattern.compile(pattern, Pattern.CASE_INSENSITIVE);
  }

  public Pattern compileQuoted(String name) {
    return Pattern.compile("^/" + Pattern.quote(name) + "/\\d+$");
  }

  public Pattern compileConstants() {
    return Pattern.compile("^(?:" + NAMES + ")$");
  }

  public Pattern compileNumber(int count) {
    return Pattern.compile("^\\d{" + count + "}$");
  }

  public String[] patternSplit(String line) {
    return WORD.split(line);
  }

  public String replace(String line, String word) {
    return line.replace(word, "");
  }

  public String replaceAllRegex(String line) {
    return line.replaceAll("\\s+", " ");
  }

  public String[] lineSeparator(String text) {
    return text.split(System.lineSeparator());
  }

  public String[] splitQuotedLocal(String line, String separator) {
    String quoted = Pattern.quote(separator);
    return line.split(quoted);
  }

  public String[] splitLiteralLocal(String line) {
    String separator = ".";
    return line.split(separator);
  }

  public String[] splitChoice(String line, boolean tabs) {
    return line.split(tabs ? "\\t" : ",");
  }

  public String[] splitCount(String line, int count) {
    return line.split("x{" + Integer.toString(count) + "}");
  }

  public Pattern compileQuotedNames(List<String> names) {
    return Pattern.compile("^(?:" + String.join("|", names.stream().map(Pattern::quote).toList()) + ")$");
  }

  public boolean duplicateAlternative(String line) {
    return line.matches("a|b|a"); // violation: RegexPartDefect
  }

  public Pattern duplicateRange() {
    return Pattern.compile("[a-zA-Z]+", Pattern.CASE_INSENSITIVE); // violation: RegexPartDefect
  }

  public Pattern nestedQuantifiers() {
    return Pattern.compile("(\\s*\\w+)*x"); // violation: BacktrackingRegex
  }

  public Pattern possessive() {
    return Pattern.compile("a|b|a++");
  }
}
