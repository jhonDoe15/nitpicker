package crew;

import lombok.ToString;

public class Roster {
    class Middle {
        @ToString
        class Inner {
            String name;
        }
    }

    class Plain {
        class Inner {
            String name;
        }
    }

    class Spoken {
        class Inner {
            String name;

            String name() {
                return this.name;
            }
        }
    }

    class Base {
    }

    static class Other {
        Roster roster;

        Object make() {
            return roster.new Base() {};
        }
    }

    class Maker {
        Roster roster;

        Object make() {
            return roster.new Base() {};
        }
    }
}
