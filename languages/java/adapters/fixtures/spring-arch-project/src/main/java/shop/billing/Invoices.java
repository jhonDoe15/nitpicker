package shop.billing;

import shop.catalog.internal.Formats;

public final class Invoices {
  private Invoices() {}

  public static String title(String value) {
    return Formats.plain(value);
  }
}
