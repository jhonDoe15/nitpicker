package e;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

class B8Args3 {
  String slice(String text, int beginIndex, int endIndex) {
    return text.substring(endIndex, beginIndex);
  }

  String sliceFine(String text, int beginIndex, int endIndex) {
    return text.substring(beginIndex, endIndex);
  }

  void checks(int fromIndex, int toIndex, int length) {
    Objects.checkFromToIndex(toIndex, fromIndex, length);
    Objects.checkFromToIndex(fromIndex, toIndex, length);
    Objects.checkFromIndexSize(fromIndex, length, toIndex);
  }

  List<String> sub(List<String> list, int fromIndex, int toIndex) {
    return list.subList(toIndex, fromIndex);
  }

  void regionMatches(String a, int toffset, String other, int ooffset, int len) {
    a.regionMatches(ooffset, other, toffset, len);
  }

  void insert(StringBuilder builder, int start, int end, String str) {
    builder.replace(end, start, str);
    builder.insert(end, str);
  }

  void copy(int[] src, int srcPos, int[] dest, int destPos, int length) {
    System.arraycopy(dest, destPos, src, srcPos, length);
    System.arraycopy(src, destPos, dest, srcPos, length);
  }
}
