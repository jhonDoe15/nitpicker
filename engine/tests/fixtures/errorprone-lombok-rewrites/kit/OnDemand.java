package kit;

import static lombok.Locked.Read;

import lombok.*;

@RequiredArgsConstructor(onConstructor_ = @Deprecated)
public class OnDemand {
  private final int size;

  public int size(@NonNull String unit) {
    return size + unit.length();
  }

  @Read
  public int read() {
    return size;
  }
}
