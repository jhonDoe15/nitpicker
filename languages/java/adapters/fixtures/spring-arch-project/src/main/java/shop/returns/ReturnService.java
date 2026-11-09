package shop.returns;

import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class ReturnService {
  public String find(Long id) {
    if (id < 0) {
      throw new ReturnNotFound(id);
    }
    return "return";
  }

  public String lookup(Optional<String> found) {
    return found.orElseThrow(ReturnNotFound::new);
  }

  public String search(Optional<String> found, Long id) {
    return found.orElseThrow(() -> new ReturnNotFound(id));
  }
}
