package crew;

import lombok.experimental.UtilityClass;

@UtilityClass
class Helpers {
    int count;

    class Nested {
        int value;
    }

    int twice(int value) {
        return value * 2;
    }
}

class Holder {
    static class Inside {
        @UtilityClass
        class Tools {
            int member;
        }
    }
}
