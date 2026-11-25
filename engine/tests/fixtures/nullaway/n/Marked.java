package n;

class Marked {
    static class OverLibrary extends marked.Library {
        @Override
        public void take(Object value) {}

        @Override
        public @Nullable Object find() {
            return null;
        }
    }

    void use(marked.Library given) {
        given.keep(null);
        given.find().hashCode();
    }

    static class OverLibraryLoose extends marked.Library.Loose {
        @Override
        public void take(Object value) {}

        @Override
        public @Nullable Object find() {
            return null;
        }
    }

    void use(marked.Library.Loose given) {
        given.keep(null);
        given.find().hashCode();
    }

    static class OverPlain extends plain.Plain {
        @Override
        public void take(Object value) {}

        @Override
        public @Nullable Object find() {
            return null;
        }
    }

    void use(plain.Plain given) {
        given.keep(null);
        given.find().hashCode();
    }

    static class OverPlainStrict extends plain.Plain.Strict {
        @Override
        public void take(Object value) {}

        @Override
        public @Nullable Object find() {
            return null;
        }
    }

    void use(plain.Plain.Strict given) {
        given.keep(null);
        given.find().hashCode();
    }

    static class OverApart extends plain.Apart {
        @Override
        public void take(Object value) {}

        @Override
        public @Nullable Object find() {
            return null;
        }
    }

    void use(plain.Apart given) {
        given.keep(null);
        given.find().hashCode();
    }

    static class OverApartLoose extends plain.Apart.Loose {
        @Override
        public void take(Object value) {}

        @Override
        public @Nullable Object find() {
            return null;
        }
    }

    void use(plain.Apart.Loose given) {
        given.keep(null);
        given.find().hashCode();
    }

    static class OverOff extends n.off.Off {
        @Override
        public void take(Object value) {}

        @Override
        public @Nullable Object find() {
            return null;
        }
    }

    void use(n.off.Off given) {
        given.keep(null);
        given.find().hashCode();
    }

    static class OverOffStrict extends n.off.Off.Strict {
        @Override
        public void take(Object value) {}

        @Override
        public @Nullable Object find() {
            return null;
        }
    }

    void use(n.off.Off.Strict given) {
        given.keep(null);
        given.find().hashCode();
    }

    static class OverOn extends n.off.On {
        @Override
        public void take(Object value) {}

        @Override
        public @Nullable Object find() {
            return null;
        }
    }

    void use(n.off.On given) {
        given.keep(null);
        given.find().hashCode();
    }
}
