package shop;

import java.util.List;

class StatusTests { // violation: TestClassWithoutTestCases
  record Probe(String tag, List<String> tags) {}

  static long total(List<Long> cents) {
    return Prices.sum(cents);
  }

  static boolean isOpen(Status status) {
    return status == Status.NEW || status == Status.PAID;
  }
}
