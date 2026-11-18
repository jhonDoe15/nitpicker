package shop.trash;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Note {
  @Id private Long id;
  private String title;
  private String author;
  private boolean archived;
}
