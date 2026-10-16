package shop;

import java.util.EnumSet;
import java.util.List;
import java.util.concurrent.TimeUnit;

public final class Orders {
  private Orders() {}

  public static boolean isOpen(Status status) {
    return status == Status.NEW || status == Status.PAID; // violation: ExhaustiveEnumPredicate
  }

  public static boolean isDone(Status status) {
    return EnumSet.of(Status.SHIPPED, Status.CANCELLED).contains(status); // violation: ExhaustiveEnumPredicate
  }

  public static boolean isKnown(Status status) {
    return status == Status.NEW
        || status == Status.PAID
        || status == Status.SHIPPED
        || status == Status.CANCELLED;
  }

  public static boolean isLong(TimeUnit unit) {
    return unit == TimeUnit.DAYS || unit == TimeUnit.HOURS;
  }

  public static int rank(Status status) {
    return switch (status) {
      case NEW, PAID -> 1;
      case SHIPPED, CANCELLED -> 2;
    };
  }

  public static long total(List<Long> cents) { // violation: StaticForwardingWrapper
    return Prices.sum(cents);
  }

  public static long withFee(List<Long> cents) {
    return Prices.sum(cents) + Prices.FEE;
  }
}
