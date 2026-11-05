package shop;

import static shop.Status.CANCELLED;
import static shop.Status.SHIPPED;

import java.util.Arrays;
import java.util.Collection;
import java.util.EnumSet;
import java.util.Iterator;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public final class Orders {
  private static final Set<Status> SETTLED = EnumSet.of(Status.SHIPPED, Status.CANCELLED);
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

  public static boolean startsOpen(Iterator<Status> statuses) {
    return statuses.next() == Status.NEW || statuses.next() == Status.PAID;
  }

  public static boolean isEitherNew(Delivery first, Delivery second) {
    return first.status() == Status.NEW || second.status() == Status.NEW;
  }

  public static boolean isPlaced(Status status) {
    return Set.of(Status.NEW, Status.PAID).contains(status); // violation: ExhaustiveEnumPredicate
  }

  public static boolean isFresh(Status status) {
    return status.equals(Status.NEW) || Objects.equals(status, Status.PAID); // violation: ExhaustiveEnumPredicate
  }

  public static boolean isFinished(Status status) {
    return switch (status) { // violation: ExhaustiveEnumPredicate
      case SHIPPED, CANCELLED -> true;
      default -> false;
    };
  }

  public static boolean isUnpaid(Status status) {
    switch (status) { // violation: ExhaustiveEnumPredicate
      case NEW:
      case PAID:
        return true;
      default:
        return false;
    }
  }

  public static boolean isQueued(Delivery delivery) {
    return List.of(Status.NEW, Status.PAID).contains(delivery.status()); // violation: ExhaustiveEnumPredicate
  }

  public static boolean isHandedOver(Status status) {
    return Arrays.asList(Status.SHIPPED, Status.CANCELLED).contains(status); // violation: ExhaustiveEnumPredicate
  }

  public static boolean isStarted(Status status) {
    return !Status.NEW.equals(status) && !status.equals(Status.PAID); // violation: ExhaustiveEnumPredicate
  }

  public static boolean isLate(Delivery delivery) {
    return switch (delivery.status()) { // violation: ExhaustiveEnumPredicate
      case SHIPPED, CANCELLED -> false;
      default -> true;
    };
  }

  public static boolean isBilled(Status status) {
    return switch (status) {
      case NEW -> false;
      case PAID -> true;
      default -> false;
    };
  }

  public static boolean isListed(Status status) {
    return switch (status) {
      case NEW, PAID, SHIPPED, CANCELLED -> true;
      default -> false;
    };
  }

  public static boolean isSettled(Status status) {
    return SETTLED.contains(status);
  }

  public static boolean isActive(Status status) {
    return switch (status) {
      case NEW, PAID, SHIPPED -> true;
      case CANCELLED -> false;
    };
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
