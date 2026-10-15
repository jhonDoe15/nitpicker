package shop.billing;

import shop.web.internal.Formats;

public final class Invoices {
  private Invoices() {}

  public static String title(String value) {
    return Formats.plain(value);
  }
}
