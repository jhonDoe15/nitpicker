package shop.receivers;

public class Chain {
  private Chain peer;
  private Chain next;
  private int depth;

  public void setPeer(Chain value) {
    this.peer = value;
  }

  public void setNext(Chain value) {
    this.next = value;
  }

  public void refine(Chain other) {
    this.depth = other.depth + 1;
  }

  public void attach(Chain other) {
    this.depth = other.depth;
  }

  public int dot(Chain other) {
    return depth * other.depth;
  }

  public boolean accept(Chain other) {
    return other != null;
  }

  public Chain self() {
    return this;
  }

  public int getDepth() {
    return depth;
  }

  public Chain getPeer() {
    return peer;
  }

  public Chain getNext() {
    return next;
  }
}
