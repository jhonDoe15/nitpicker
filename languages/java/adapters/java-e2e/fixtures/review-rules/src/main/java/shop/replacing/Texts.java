package shop.replacing;

import java.io.File;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Texts {
  String spaces(String path) {
    return path.replace("\\s+", ""); // violation: ReplaceWithWrongLiteralKind
  }

  String lookbehind(String name) {
    return name.replace("(?<!solr-)analysis-", "x"); // violation: ReplaceWithWrongLiteralKind
  }

  String escapedDollars(String text) {
    return text.replace("\\$\\$", "\\$"); // violation: ReplaceWithWrongLiteralKind
  }

  String wildcard(String text) {
    return text.replace(".*", "x"); // violation: ReplaceWithWrongLiteralKind
  }

  String digits(String text) {
    return text.replace("[0-9]+", "#"); // violation: ReplaceWithWrongLiteralKind
  }

  String extension(String file) {
    return file.replaceAll(".tmp", ""); // violation: ReplaceWithWrongLiteralKind
  }

  String question(String sql, String value) {
    return sql.replaceAll("?", value); // violation: ReplaceWithWrongLiteralKind
  }

  String star(String text) {
    return text.replaceFirst("*", "x"); // violation: ReplaceWithWrongLiteralKind
  }

  String pipe(String text) {
    return text.replaceAll("|", ","); // violation: ReplaceWithWrongLiteralKind
  }

  String joinedSeparator(String text) {
    return text.replaceAll("x+", "a" + File.separator); // violation: ReplaceWithWrongLiteralKind
  }

  String variableSeparator(String text, String regex) {
    return text.replaceAll(regex, File.separator); // violation: ReplaceWithWrongLiteralKind, UnquotedRegexValue
  }

  String packagePath(String pkg) {
    return pkg.replaceAll("\\.", File.separator); // violation: ReplaceWithWrongLiteralKind
  }

  String windowsPath(String text) {
    return text.replaceAll("x+", "C:\\temp"); // violation: ReplaceWithWrongLiteralKind
  }

  String dollar(String text) {
    return text.replaceAll("x+", "$"); // violation: ReplaceWithWrongLiteralKind
  }

  String separatorForSlash(String path) {
    return path.replaceAll("/", File.separator); // violation: PlainTextRegex
  }

  String comma(String text) {
    return text.replace(",", "");
  }

  String regexSpaces(String text) {
    return text.replaceAll("\\s+", " ");
  }

  String hyphen(String text) {
    return text.replaceAll("-", "_"); // violation: PlainTextRegex
  }

  String quoted(String text, String input) {
    return text.replaceAll(Pattern.quote(input), "x");
  }

  String escapedDot(String file) {
    return file.replaceAll("\\.tmp", "");
  }

  String plainExtension(String file) {
    return file.replace(".tmp", "");
  }

  String plainQuestion(String sql, String value) {
    return sql.replace("?", value);
  }

  String packageChars(String pkg) {
    return pkg.replace('.', File.separatorChar);
  }

  String quotedReplacement(String pkg) {
    return pkg.replaceAll("\\.", Matcher.quoteReplacement(File.separator));
  }

  String groupReference(String text) {
    return text.replaceAll("(\\d+)-(\\d+)", "$2-$1");
  }

  String escapedBackslash(String text) {
    return text.replaceAll("x+", "C:\\\\temp");
  }

  String escapedDollar(String text) {
    return text.replaceAll("x+", "\\$");
  }

  String lonePattern(String text, String regex) {
    return text.replaceAll(regex, "x").replaceAll(".*", "").replaceAll("\\?", ""); // violation: UnquotedRegexValue
  }

  String dotted(String text) {
    return text.replace("a.b", "c").replace("[", "(").replace("(", "[");
  }

  String mask(String password) {
    return password.replaceAll(".", "*");
  }

  String quote(String text) {
    return text.replaceAll("^", "> ").replaceAll("$", ";");
  }

  String unescape(String text) {
    return text.replace("\\.", ".").replace("\\$", "$").replace("\\(", "(").replace("\\s", " ");
  }

  String regexRewrite(String regex) {
    return regex.replace("\\d", "[0-9]");
  }

  String builder(StringBuilder text) {
    return text.replace(0, 1, "x[0-9]").toString();
  }
}
