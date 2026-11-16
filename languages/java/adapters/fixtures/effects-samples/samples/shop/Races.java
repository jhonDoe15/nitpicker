package shop;

import java.util.List;
import java.util.Optional;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Version;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Service;

@Entity
class Booking {
  @Id Long id;
  String holder;
}

@Entity
class Cabin {
  @Id Long id;
  @Version long version;
  String holder;
}

interface Bookings extends CrudRepository<Booking, Long> {
  boolean existsByHolder(String holder);

  List<Booking> findByHolder(String holder);

  @Lock
  Optional<Booking> lockById(Long id);
}

interface Cabins extends CrudRepository<Cabin, Long> {}

@Service
class Races {
  private final Bookings slots;
  private final Cabins cabins;

  Races(Bookings slots, Cabins cabins) {
    this.slots = slots;
    this.cabins = cabins;
  }

  public void reserve(String holder) {
    if (slots.existsByHolder(holder)) {
      throw new IllegalStateException();
    }
    slots.save(new Booking());
  }

  public void claim(Long id, String holder) {
    Booking slot = slots.findById(id).orElseThrow();
    if (slot.holder != null) {
      throw new IllegalStateException();
    }
    slot.holder = holder;
    slots.save(slot);
  }

  public void claimLocked(Long id, String holder) {
    Booking slot = slots.lockById(id).orElseThrow();
    if (slot.holder != null) {
      throw new IllegalStateException();
    }
    slot.holder = holder;
    slots.save(slot);
  }

  public void claimVersioned(Long id, String holder) {
    Cabin cabin = cabins.findById(id).orElseThrow();
    if (cabin.holder != null) {
      throw new IllegalStateException();
    }
    cabin.holder = holder;
    cabins.save(cabin);
  }

  public void reserveOther(String holder) {
    if (slots.existsByHolder(holder)) {
      throw new IllegalStateException();
    }
    cabins.save(new Cabin());
  }

  public void releaseFirst(String holder) {
    List<Booking> held = slots.findByHolder(holder);
    if (held.isEmpty()) {
      return;
    }
    slots.delete(held.get(0));
  }

  public void releaseCounted(String holder) {
    List<Booking> held = slots.findByHolder(holder);
    if (held.size() > 0) {
      slots.delete(held.get(0));
    }
  }
}
