package sale;

import lombok.Value;

@Value
public class Label {
  String text;
  int size;

  public String shout() {
    return text.toUpperCase();
  }
}
