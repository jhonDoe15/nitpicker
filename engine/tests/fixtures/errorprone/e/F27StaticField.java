package e;

import static e.F27StaticField.Holder.shared;

import java.util.ArrayList;
import java.util.List;

class F27StaticField {
    static class Holder {
        static List<String> shared = new ArrayList<>();
    }

    void run() {
        shared.addAll(shared);
    }
}
