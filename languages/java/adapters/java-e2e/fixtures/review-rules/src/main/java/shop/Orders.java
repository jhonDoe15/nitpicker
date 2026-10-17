package shop;

import static shop.Status.CANCELLED;
import static shop.Status.SHIPPED;

import java.util.Collection;
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

  public static boolean isClosed(Status status) {
    return status == SHIPPED || status == CANCELLED; // violation: ExhaustiveEnumPredicate
  }

  public static boolean isPending(Delivery delivery) {
    return delivery.status() == Status.NEW // violation: ExhaustiveEnumPredicate
        || delivery.status() == Status.PAID;
  }

  public static boolean isDue(Status status, boolean paid) {
    return (status == Status.NEW || status == Status.PAID) // violation: ExhaustiveEnumPredicate
        && paid;
  }

  public static String label(Status status) {
    return status == Status.NEW || status == Status.PAID // violation: ExhaustiveEnumPredicate
        ? "open"
        : "closed";
  }

  public static boolean isEitherNew(Delivery first, Delivery second) {
    return first.status() == Status.NEW || second.status() == Status.NEW;
  }

  public static Delivery of(Status status) {
    return delivery(status);
  }

  public static List<Long> copy(Collection<Long> cents) {
    return List.copyOf(cents);
  }

  private static Delivery delivery(Status status) {
    return new Delivery(status);
  }
}
