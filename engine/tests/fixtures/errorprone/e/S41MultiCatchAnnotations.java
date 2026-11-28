import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

class S41MultiCatchAnnotations {
  void declared() {
    try {
      Integer.parseInt("1");
    } catch (@Nullable @NonNull IllegalStateException | @Nullable IllegalArgumentException e) {
      throw e;
    }
  }

  void alternatives() {
    try {
      Integer.parseInt("1");
    } catch (IllegalStateException | @Nullable @NonNull IllegalArgumentException | @Nullable NullPointerException e) {
      throw e;
    }
  }

  void single() {
    try {
      Integer.parseInt("1");
    } catch (@Nullable @NonNull IllegalStateException e) {
      throw e;
    }
  }

  void commented() {
    try {
      Integer.parseInt("1");
    } catch (IllegalStateException | /* c */ @Nullable /* d */ @NonNull IllegalArgumentException e) {
      throw e;
    } catch (final @Deprecated RuntimeException | @Nullable Error e) {
      throw e;
    }
  }
}
