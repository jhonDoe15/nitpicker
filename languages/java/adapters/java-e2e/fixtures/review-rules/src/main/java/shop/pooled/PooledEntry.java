package shop.pooled;

import io.netty.util.Recycler;
import java.util.ArrayList;
import java.util.List;

public final class PooledEntry {
  private static final Recycler<PooledEntry> RECYCLER = new Recycler<>() {
    @Override
    protected PooledEntry newObject(Handle<PooledEntry> handle) {
      return new PooledEntry(handle);
    }
  };

  private final Recycler.Handle<PooledEntry> handle;
  private long ledgerId;
  private long entryId;
  private String position; // violation: PooledFieldNotReset
  private boolean metadataParsed; // violation: PooledFieldNotReset
  private String owner;
  private final List<String> tags = new ArrayList<>();
  private int attempts;

  private PooledEntry(Recycler.Handle<PooledEntry> handle) {
    this.handle = handle;
  }

  public static PooledEntry create(long ledgerId, long entryId, String owner) {
    PooledEntry entry = RECYCLER.get();
    entry.ledgerId = ledgerId;
    entry.entryId = entryId;
    entry.owner = owner;
    entry.attempts = 0;
    return entry;
  }

  public String position() {
    if (position == null) {
      position = ledgerId + ":" + entryId;
    }
    return position;
  }

  public boolean parseMetadata() {
    if (!metadataParsed) {
      metadataParsed = true;
      return true;
    }
    return false;
  }

  public void tag(String tag) {
    tags.add(tag);
  }

  public int retry() {
    attempts++;
    return attempts;
  }

  public String owner() {
    return owner;
  }

  public void recycle() {
    ledgerId = -1;
    entryId = -1;
    owner = null;
    tags.clear();
    handle.recycle(this);
  }

  static final class Slot {
    private static final Recycler<Slot> SLOTS = new Recycler<>() {
      @Override
      protected Slot newObject(Handle<Slot> handle) {
        return new Slot(handle);
      }
    };

    private final Recycler.Handle<Slot> handle;
    private String label;

    private Slot(Recycler.Handle<Slot> handle) {
      this.handle = handle;
    }

    static Slot create() {
      return SLOTS.get();
    }

    void label(String value) {
      label = value;
    }

    String label() {
      return label;
    }

    void recycle() {
      SlotResets.clear(this);
      handle.recycle(this);
    }
  }

  static final class SlotResets {
    private SlotResets() {}

    static void clear(Slot slot) {
      slot.label(null);
    }
  }
}
