package crew;

import lombok.Builder;
import lombok.experimental.Tolerate;

@Builder
public class Shift {
    private final int hours;

    public static class ShiftBuilder {
        @Tolerate
        public ShiftBuilder hours(String text) {
            return this.hours(Integer.parseInt(text));
        }

        public ShiftBuilder half(int text) {
            hours(text / 2);
            return null;
        }
    }
}
