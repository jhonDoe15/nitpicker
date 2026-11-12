package shop;

import java.util.List;
import java.util.function.ToLongFunction;

public class Cart implements ToLongFunction<List<Long>> {
  @interface Audited {}

  public long total(List<Long> cents) { // violation: ForwardingMethodAlias
    return sum(cents);
  }

  public long totalHere(List<Long> cents) { // violation: ForwardingMethodAlias
    return this.sum(cents);
  }

  public long size(List<Long> cents) { // violation: ForwardingMethodAlias
    return count(cents);
  }

  public long annotated(@Audited List<Long> cents) {
    return sum(cents);
  }

  public synchronized long locked(List<Long> cents) {
    return sum(cents);
  }

  public long withFee(List<Long> cents) {
    return sum(cents) + Prices.FEE;
  }

  public long viaOther(List<Long> cents, long fee) {
    return pair(fee, cents);
  }

  @Audited
  public long legacy(List<Long> cents) {
    return sum(cents);
  }

  public long of(List<Long> cents) {
    return sum(cents);
  }

  public long applyAsLong(List<Long> cents) {
    return sum(cents);
  }

  public long nextTotal(List<Long> cents) {
    return next(cents);
  }

  public long next(List<Long> cents) {
    return sum(cents);
  }

  public long next(List<Long> cents, long fee) {
    return sum(cents) + fee;
  }

  public Number widened(List<Long> cents) {
    return sum(cents);
  }

  public long count(List<Long> cents) {
    return cents.size();
  }

  long sum(List<Long> cents) {
    return Prices.sum(cents);
  }

  long pair(long fee, List<Long> cents) {
    return sum(cents) + fee;
  }
}
