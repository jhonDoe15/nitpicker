package guards;

public final class Invoice { // violation: duplicates/duplicate-clone
  public int invoice(int price) {
    int total = 0;
    total = total + scale(price, total) + discount(total, price);
    total = total + scale(price, total) - discount(total, price);
    total = total + scale(price, total) * discount(total, price);
    total = total + scale(price, total) ^ discount(total, price);
    total = total - scale(price, total) + discount(total, price);
    total = total - scale(price, total) - discount(total, price);
    total = total - scale(price, total) * discount(total, price);
    total = total - scale(price, total) ^ discount(total, price);
    total = total * scale(price, total) + discount(total, price);
    total = total * scale(price, total) - discount(total, price);
    total = total * scale(price, total) * discount(total, price);
    total = total * scale(price, total) ^ discount(total, price);
    total = total ^ scale(price, total) + discount(total, price);
    total = total ^ scale(price, total) - discount(total, price);
    return total;
  }

  private int scale(int value, int step) {
    return value * step;
  }

  private int discount(int value, int step) {
    return value / (step + 1);
  }
}
