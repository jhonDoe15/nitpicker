package shop.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Cart {
  private final List<Item> items = new ArrayList<>();
  private final List<Item> pending;
  private String owner;

  public Cart(String owner) {
    this.owner = owner;
    this.pending = new ArrayList<>(List.of());
  }

  public List<Item> lines() {
    return items;
  }

  public List<Item> copy() {
    return List.copyOf(items);
  }

  public List<Item> view() {
    return Collections.unmodifiableList(items);
  }

  public List<Item> queued(boolean ready) {
    return ready ? pending : copy();
  }

  public void add(Item item) {
    items.add(item);
  }

  public String owner() {
    return owner;
  }
}
