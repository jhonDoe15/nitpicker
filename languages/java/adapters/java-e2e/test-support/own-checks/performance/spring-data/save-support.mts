const SAVES = 'src/main/java/demo/saves';

export const SAVE_SUPPORT_FILES = {
  [`${SAVES}/Item.java`]: `package demo.saves;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Item {
  @Id
  private Long id;
  private String name;

  public Long getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }
}
`,
  [`${SAVES}/ItemRepository.java`]: `package demo.saves;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ItemRepository extends JpaRepository<Item, Long> {
  boolean existsByName(String name);
}
`,
  [`${SAVES}/Audit.java`]: `package demo.saves;

import org.springframework.stereotype.Service;

@Service
public class Audit {
  public void record(Item item) {}
}
`,
};

export function savesClass(name: string, body: string): string {
  return `package demo.saves;

import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ${name} {
  private final ItemRepository items;
  private final Audit audit;
  private EntityManager entityManager;

  ${name}(ItemRepository items, Audit audit) {
    this.items = items;
    this.audit = audit;
  }
${body}}
`;
}
