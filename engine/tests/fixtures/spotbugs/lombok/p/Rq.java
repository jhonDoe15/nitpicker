package p;

import java.util.Map;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;

@RequiredArgsConstructor
public class Rq {
    @NonNull
    private final Map<String, String> map;
    private final String name;

    @SneakyThrows
    public void run() {
        Thread.sleep(1);
    }
}
