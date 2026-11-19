package shop.carts;

import java.util.Iterator;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class BasketReports {
  private final ItemRepository items;

  public BasketReports(ItemRepository items) {
    this.items = items;
  }

  public int total(Basket basket) {
    int sum = 0;
    for (Item item : basket.getItems()) {
      if (item.getDeletedAt() == null) {
        sum += item.getPrice() * item.getQuantity();
      }
    }
    return sum;
  }

  public long live(Basket basket) {
    return basket.getItems().stream().filter(item -> item.getDeletedAt() == null).count();
  }

  public int units(Basket basket) {
    int sum = 0;
    for (Item item : basket.getItems()) {
      if (item.getDeletedAt() != null) {
        continue;
      }
      sum += item.getQuantity();
    }
    return sum;
  }

  public int dearest(Long basket) {
    int best = 0;
    for (Item item : items.findByBasketIdAndDeletedAtIsNull(basket)) {
      best = Math.max(best, item.getPrice());
    }
    return best;
  }

  public int cheapest(Basket basket) {
    int best = Integer.MAX_VALUE;
    Iterator<Item> each = basket.getItems().iterator();
    while (each.hasNext()) {
      Item item = each.next();
      if (item.getDeletedAt() == null && item.getPrice() < best) {
        best = item.getPrice();
      }
    }
    return best;
  }

  public int priced(Basket basket) {
    int[] sum = new int[1];
    basket.getItems().forEach(item -> {
      if (item.getDeletedAt() == null) {
        sum[0] += item.getPrice();
      }
    });
    return sum[0];
  }

  public boolean hasAny(Basket basket) {
    for (Item item : basket.getItems()) {
      if (item.getDeletedAt() == null) {
        return true;
      }
    }
    return false;
  }

  public Item first(Basket basket) {
    return basket.getItems().stream().filter(item -> item.getDeletedAt() == null).findFirst().orElse(null);
  }

  public int count(Basket basket) {
    int count = 0;
    for (Item item : basket.getItems()) {
      count += item.getQuantity();
    }
    return count;
  }

  public int quantities(Basket basket) {
    return basket.getItems().stream().mapToInt(Item::getQuantity).sum();
  }

  public List<Item> everything(Basket basket) {
    return basket.getItems();
  }

  public int trashed(Long basket) {
    int count = 0;
    for (Item item : items.findByBasketIdIncludingDeleted(basket)) {
      count += item.getQuantity() + item.getPrice();
    }
    return count;
  }
}
