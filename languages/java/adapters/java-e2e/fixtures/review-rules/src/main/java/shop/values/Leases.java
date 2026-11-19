package shop.values;

import java.util.concurrent.TimeUnit;

public class Leases {
  private static final int SECOND = 1000;
  private static final long PICOS_PER_SECOND = 1_000_000_000_000L;
  private final long expirationTime;

  public Leases(int timeToLive) {
    this.expirationTime = System.currentTimeMillis() + timeToLive * 1000; // violation: IntProductWidenedLate
  }

  public long expiresAt() {
    return expirationTime;
  }

  long picoseconds(int hour, int minute, int second) {
    return (((hour * 60) + minute) * 60 + second) * PICOS_PER_SECOND; // violation: IntProductWidenedLate
  }

  long refreshAt(long createdAt, int maxAge) {
    return createdAt + (maxAge * SECOND); // violation: IntProductWidenedLate
  }

  long window(long start, int blocks, int blockSize) {
    return start + blocks * blockSize; // violation: IntProductWidenedLate
  }

  long scaled(long base, int steps) {
    return base + (steps << 20); // violation: IntProductWidenedLate
  }

  long widenedLiteral(int timeToLive) {
    return System.currentTimeMillis() + timeToLive * 1000L;
  }

  long widenedFactor(int hour, int minute) {
    return ((long) hour * 60 + minute) * PICOS_PER_SECOND;
  }

  long converted(int timeToLive) {
    return System.currentTimeMillis() + TimeUnit.SECONDS.toMillis(timeToLive);
  }

  long exact(long base, int blocks, int blockSize) {
    return base + Math.multiplyExact(blocks, blockSize);
  }

  long constantProduct(long base) {
    return base + 24 * 60 * 60 * 1000;
  }

  long shortFactor(long base, short count) {
    return base + count * 1000;
  }

  long wholeExpression(int blocks, int blockSize) {
    return blocks * blockSize;
  }

  long castProduct(long base, int blocks, int blockSize) {
    return base + (long) (blocks * blockSize);
  }

  int smallSum(int a, int b, int c) {
    return a + b * c;
  }

  long constantLocals(long base) {
    final int minute = 60;
    return base + minute * minute;
  }

  long strided(long base, int count, int stride) {
    long total = base;
    for (int i = 0; i < count; i++) {
      total += base + i * stride;
    }
    return total;
  }

  long offset(long base, int count, int[] values) {
    return base + count * 4 + 1024 + values.length * count;
  }

  long unresolvedCalls(long base, Lease lease) {
    return base + 31 * lease.entryId() + lease.size() * 3;
  }

  record Lease(int entryId, int size) {
  }
}
