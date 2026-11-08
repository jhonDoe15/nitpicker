package shop.tree;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;
import lombok.Value;

@Data
public class Category {
  private String name;
  private Category parent; // violation: GeneratedMemberCycle
  private List<Category> children = new ArrayList<>();

  @Value
  public static class Folder {
    String name;
    List<Folder> folders;
  }
}
