package com.example.settings.domain;

/** Reads the items of one value from left to right. */
final class ValueScanner {
  private static final char QUOTE = '"';
  private static final char ESCAPE = '\\';
  private static final char SEPARATOR = ',';

  private final String text;
  private final int lineNumber;
  private int position;

  ValueScanner(String text, int lineNumber) {
    this.text = text;
    this.lineNumber = lineNumber;
  }

  /** Reads the next item and stops at the separator after it, or at the end. */
  String nextItem() {
    skipSpaces();
    if (atQuote()) {
      return quotedItem();
    }
    return plainItem();
  }

  /** Steps over a separator; true when one was there, so another item follows it. */
  boolean consumeSeparator() {
    if (position >= text.length()) {
      return false;
    }
    position++;
    return true;
  }

  private boolean atQuote() {
    return position < text.length() && text.charAt(position) == QUOTE;
  }

  private void skipSpaces() {
    while (position < text.length() && Character.isWhitespace(text.charAt(position))) {
      position++;
    }
  }

  private String plainItem() {
    int separator = text.indexOf(SEPARATOR, position);
    int end = separator < 0 ? text.length() : separator;
    String item = text.substring(position, end).trim();
    position = end;
    return item;
  }

  private String quotedItem() {
    position++;
    String item = quotedText();
    skipSpaces();
    if (position < text.length() && text.charAt(position) != SEPARATOR) {
      throw failure("unexpected text after closing quote");
    }
    return item;
  }

  private String quotedText() {
    StringBuilder item = new StringBuilder();
    boolean closed = false;
    while (!closed && position < text.length()) {
      char current = text.charAt(position);
      position++;
      if (current == ESCAPE) {
        appendEscaped(item);
      } else if (current == QUOTE) {
        closed = true;
      } else {
        item.append(current);
      }
    }
    if (!closed) {
      throw failure("unterminated quote");
    }
    return item.toString();
  }

  private void appendEscaped(StringBuilder item) {
    if (position >= text.length()) {
      return;
    }
    char escaped = text.charAt(position);
    position++;
    if (escaped != QUOTE && escaped != ESCAPE) {
      item.append(ESCAPE);
    }
    item.append(escaped);
  }

  private IllegalArgumentException failure(String reason) {
    return new IllegalArgumentException("Line " + lineNumber + ": " + reason);
  }
}
