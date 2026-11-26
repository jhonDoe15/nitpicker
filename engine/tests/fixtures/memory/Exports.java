package memory;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class Exports {
  private final ObjectMapper mapper = new ObjectMapper();

  public void results(Path out, List<String> results) throws IOException {
    Files.writeString(out, mapper.writeValueAsString(results));
  }

  public void filled(Path out, List<Path> inputs) throws IOException {
    List<String> names = new ArrayList<>();
    for (Path input : inputs) {
      names.add(input.getFileName().toString());
    }
    String text = String.join("\n", names);
    Files.write(out, text.getBytes(StandardCharsets.UTF_8));
  }

  public void joined(Path out, List<String> lines) throws IOException {
    Files.writeString(out, lines.stream().collect(Collectors.joining("\n")));
  }

  public List<Map<String, Object>> readBack(Path in) throws IOException {
    return mapper.readValue(Files.readString(in), new TypeReference<List<Map<String, Object>>>() {});
  }

  public void settings(Path out, Map<String, String> settings) throws IOException {
    Files.writeString(out, mapper.writeValueAsString(settings));
  }

  public void fixed(Path out, List<String> pair) throws IOException {
    Files.writeString(out, String.join(",", pair));
  }

  public Map<String, Object> readOne(Path in) throws IOException {
    return mapper.readValue(Files.readString(in), new TypeReference<Map<String, Object>>() {});
  }

  public void streamed(Path out, List<String> results) throws IOException {
    mapper.writerFor(String.class).withRootValueSeparator("\n").writeValues(out.toFile()).writeAll(results);
  }

  public void profiles(Path out, List<String> profiles) throws IOException {
    Files.writeString(out, String.join(",", profiles));
  }

  public void reportFiles(Path out, List<String> reportFiles) throws IOException {
    Files.writeString(out, String.join("\n", reportFiles));
  }
}
