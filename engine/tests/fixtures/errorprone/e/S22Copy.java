import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import com.google.protobuf.MessageLite;
import java.util.Collection;
import java.util.List;
import java.util.Map;

class S22Copy {
  abstract static class Proto implements MessageLite {
    abstract List<String> getNameList();

    abstract Map<Integer, Integer> getWeightMap();

    abstract String getName();

    Proto self() {
      return this;
    }
  }

  List<String> viaVariable(Proto m) {
    ImmutableList<String> l = ImmutableList.copyOf(m.getNameList());
    return l;
  }

  List<String> usageIsMethodInvocation(Proto m) {
    ImmutableList<String> l = ImmutableList.copyOf(m.getNameList());
    return l.subList(0, 1);
  }

  Map<Integer, Integer> viaMap(Proto m) {
    ImmutableMap<Integer, Integer> l = ImmutableMap.copyOf(m.getWeightMap());
    return l;
  }

  List<String> rawType(Proto m) {
    ImmutableList l = ImmutableList.copyOf(m.getNameList());
    return l;
  }

  List<String> usedDirectly(Proto m) {
    return ImmutableList.copyOf(m.getNameList());
  }

  Collection<String> usedAsCollection(Proto m) {
    return ImmutableList.copyOf(m.getNameList());
  }

  ImmutableList<String> needsImmutable(Proto m) {
    return ImmutableList.copyOf(m.getNameList());
  }

  ImmutableList<String> variableNeedsImmutable(Proto m) {
    ImmutableList<String> l = ImmutableList.copyOf(m.getNameList());
    return l;
  }

  void takesImmutable(ImmutableList<String> l) {}

  void variablePassedOn(Proto m) {
    ImmutableList<String> l = ImmutableList.copyOf(m.getNameList());
    takesImmutable(l);
  }

  void variableAsObject(Proto m) {
    ImmutableList<String> l = ImmutableList.copyOf(m.getNameList());
    Object o = l;
  }

  void notAProto(List<String> plain, Proto m) {
    ImmutableList<String> copy = ImmutableList.copyOf(plain);
    ImmutableList<String> other = ImmutableList.copyOf(m.self().getNameList());
  }

  void parenthesized(Proto m) {
    List<String> l = ImmutableList.copyOf((m.getNameList()));
  }

  void assigned(Proto m) {
    ImmutableList<String> l;
    l = ImmutableList.copyOf(m.getNameList());
  }

  void argument(Proto m) {
    System.out.println(ImmutableList.copyOf(m.getNameList()));
  }

  @SuppressWarnings("UnnecessaryCopy")
  List<String> suppressed(Proto m) {
    return ImmutableList.copyOf(m.getNameList());
  }
}
