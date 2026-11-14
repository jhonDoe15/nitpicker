package guards;

public final class Receipt {
  public int receipt(int cost) {
    int sum = 0;
    sum = sum + scale(cost, sum) + discount(sum, cost);
    sum = sum + scale(cost, sum) - discount(sum, cost);
    sum = sum + scale(cost, sum) * discount(sum, cost);
    sum = sum + scale(cost, sum) ^ discount(sum, cost);
    sum = sum - scale(cost, sum) + discount(sum, cost);
    sum = sum - scale(cost, sum) - discount(sum, cost);
    sum = sum - scale(cost, sum) * discount(sum, cost);
    sum = sum - scale(cost, sum) ^ discount(sum, cost);
    sum = sum * scale(cost, sum) + discount(sum, cost);
    sum = sum * scale(cost, sum) - discount(sum, cost);
    sum = sum * scale(cost, sum) * discount(sum, cost);
    sum = sum * scale(cost, sum) ^ discount(sum, cost);
    sum = sum ^ scale(cost, sum) + discount(sum, cost);
    sum = sum ^ scale(cost, sum) - discount(sum, cost);
    return sum;
  }

  private int scale(int value, int step) {
    return value * step;
  }

  private int discount(int value, int step) {
    return value / (step + 1);
  }
}
