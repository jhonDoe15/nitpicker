package shop.affixes;

public final class Affixes {
  public String filePath(String path) {
    if (path.startsWith("file://")) {
      return path.substring(6); // violation: AffixLengthMismatch
    }
    return path;
  }

  public String propertyName(String name) {
    return name.startsWith("prop.") ? name.substring(6) : name;
  }

  public String unquote(String text) {
    if (text.length() > 1 && text.charAt(0) == '"' && text.charAt(text.length() - 1) == '"') {
      return text.substring(1, text.length() - 2); // violation: AffixLengthMismatch
    }
    return text;
  }

  public String unquoteQuotes(String json) {
    if (json.startsWith("\"") && json.endsWith("\"")) {
      return json.substring(1, json.length() - 2); // violation: AffixLengthMismatch
    }
    return json;
  }

  public String stripBraces(String expression) {
    if (expression.startsWith("${") && expression.endsWith("}")) {
      return expression.substring(2, expression.length() - 2); // violation: AffixLengthMismatch
    }
    return expression;
  }

  public String earlyReturn(String address) {
    if (!address.startsWith("mailto:")) {
      return address;
    }
    return address.substring(6); // violation: AffixLengthMismatch
  }

  public String exactOffset(String path) {
    if (path.startsWith("file://")) {
      return path.substring(7);
    }
    return path;
  }

  public String computedOffset(String path) {
    if (path.startsWith("file://")) {
      return path.substring("file://".length());
    }
    return path;
  }

  public String extraSeparator(String path) {
    if (path.startsWith("file:") && path.charAt(5) == '/') {
      return path.substring(6);
    }
    return path;
  }

  public String exactQuotes(String text) {
    if (text.length() > 1 && text.charAt(0) == '"' && text.charAt(text.length() - 1) == '"') {
      return text.substring(1, text.length() - 1);
    }
    return text;
  }

  public String untested(String path) {
    return path.substring(6);
  }

  public String wildcardHost(String host) {
    if (host.startsWith("*.")) {
      return host.substring(1);
    }
    return host;
  }

  public String accessorName(String method) {
    if (method.startsWith("get")) {
      return method.substring(4);
    }
    return method;
  }

  public String headerValue(String line) {
    if (line.startsWith("Key:")) {
      return line.substring(5).trim();
    }
    return line;
  }

  public String shortKey(String line) {
    if (line.startsWith("x:")) {
      return line.substring(3);
    }
    return line;
  }

  public String packageTail(String name) {
    if (name.startsWith("com.")) {
      return name.substring(3);
    }
    return name;
  }
}
