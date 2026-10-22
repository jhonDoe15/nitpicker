package shop.service;

import java.util.List;
import shop.model.Cart;
import shop.model.Item;

public class Checkout {
  public void direct(Cart c, Item item) {
    c.lines().add(item);
  }

  public void aliased(Cart c, Item item) {
    List<Item> lines = c.lines();
    lines.add(item);
  }

  public void reassigned(Cart c, Item item) {
    List<Item> lines = c.lines();
    lines = c.copy();
    lines.add(item);
  }

  public void copied(Cart c, Item item) {
    c.copy().add(item);
  }

  public void viewed(Cart c, Item item) {
    c.view().add(item);
  }

  public void queued(Cart c, Item item) {
    c.queued(true).add(item);
  }

  public void wrapped(Cart c, Item item) {
    new java.util.ArrayList<>(c.lines()).add(item);
  }
}
