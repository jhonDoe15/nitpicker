package e;

import com.google.protobuf.GeneratedMessage;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

class B6NullCompare {
  static final class Proto extends GeneratedMessage {
    String getName() {
      return "";
    }

    boolean hasName() {
      return true;
    }

    String getPlain() {
      return "";
    }

    List<String> getItemList() {
      return null;
    }

    String getItem(int index) {
      return "";
    }

    int getItemCount() {
      return 0;
    }

    int getNumber() {
      return 0;
    }
  }

  void positive(Proto proto, Optional<String> optional, int index) {
    if (proto.getName() == null) {}
    if (proto.getName() != null) {}
    if (null == proto.getName()) {}
    if (proto.getPlain() == null) {}
    if (proto.getItemList() == null) {}
    if (proto.getItemList() != null) {}
    if (proto.getItem(index) == null) {}
    if (proto.getItem(2) != null) {}
    if (optional.get() == null) {}
    if (optional.orElseThrow() != null) {}
    Objects.requireNonNull(proto.getName());
    String copy = Objects.requireNonNull(proto.getName());
    Optional.ofNullable(proto.getName());
    final String name = proto.getName();
    if (name == null) {}
    String effectively = (String) proto.getPlain();
    if (effectively != null) {}
    int number = 3;
    Integer boxed = Integer.valueOf("3");
    if (Integer.valueOf("3") == null) {}
  }

  void negative(Proto proto, Optional<String> optional, String other) {
    if (other == null) {}
    String changed = proto.getName();
    changed = "x";
    if (changed == null) {}
    if (proto.getNumber() == 0) {}
    if (optional == null) {}
    if (getName() == null) {}
    Objects.requireNonNull(other);
    Optional.ofNullable(other);
  }

  String getName() {
    return null;
  }

  void switches(Proto proto, String other) {
    switch (proto.getName()) {
      case null -> {}
      default -> {}
    }
    switch (other) {
      case null -> {}
      default -> {}
    }
  }

  @SuppressWarnings("ProtoFieldNullComparison")
  void alternativeName(Proto proto) {
    if (proto.getName() == null) {}
  }

  @SuppressWarnings("ImpossibleNullComparison")
  void suppressed(Proto proto) {
    if (proto.getName() == null) {}
  }
}
