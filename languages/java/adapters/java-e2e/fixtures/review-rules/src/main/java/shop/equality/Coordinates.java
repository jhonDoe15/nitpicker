package shop.equality;

import java.util.List;
import java.util.Objects;
import java.util.logging.Logger;
import java.util.regex.Pattern;

public final class Coordinates {
    private Coordinates() {
    }

    public static final class ArtifactCoordinates {
        private final String groupId;
        private final String artifactId;
        private final String version;
        private final String extension; // violation: EqualsLeavesOutField
        private final String classifier;

        public ArtifactCoordinates(String groupId, String artifactId, String version, String extension,
                String classifier) {
            this.groupId = groupId;
            this.artifactId = artifactId;
            this.version = version;
            this.extension = extension;
            this.classifier = classifier;
        }

        public String getGroupId() {
            return groupId;
        }

        public String getArtifactId() {
            return artifactId;
        }

        public String getVersion() {
            return version;
        }

        public String getExtension() {
            return extension;
        }

        public String getClassifier() {
            return classifier;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (other == null || getClass() != other.getClass()) {
                return false;
            }
            ArtifactCoordinates that = (ArtifactCoordinates) other;
            return Objects.equals(getGroupId(), that.getGroupId())
                && Objects.equals(getArtifactId(), that.getArtifactId())
                && Objects.equals(getVersion(), that.getVersion())
                && Objects.equals(getClassifier(), that.getClassifier());
        }

        @Override
        public int hashCode() {
            return Objects.hash(getGroupId(), getArtifactId(), getVersion(), getClassifier());
        }
    }

    public static final class CategoryScores {
        private final double toxicity;
        private final double spam;
        private final double violence;
        private final double hate; // violation: EqualsLeavesOutField

        public CategoryScores(double toxicity, double spam, double violence, double hate) {
            this.toxicity = toxicity;
            this.spam = spam;
            this.violence = violence;
            this.hate = hate;
        }

        public double getToxicity() {
            return toxicity;
        }

        public double getSpam() {
            return spam;
        }

        public double getViolence() {
            return violence;
        }

        public double getHate() {
            return hate;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof CategoryScores that && toxicity == that.toxicity && spam == that.spam
                && violence == that.violence;
        }

        @Override
        public int hashCode() {
            return Objects.hash(toxicity, spam, violence);
        }
    }

    public static final class Range {
        private static final Logger LOG = Logger.getLogger(Range.class.getName());

        private final int low;
        private final int high;
        private final int width;
        private final List<Runnable> listeners;
        private final String label;
        private transient String description;
        private String summary;

        public Range(int low, int high, List<Runnable> listeners, String label) {
            this.low = low;
            this.high = high;
            this.width = high - low;
            this.listeners = listeners;
            this.label = label;
        }

        public int getLow() {
            return low;
        }

        public int getHigh() {
            return high;
        }

        public int getWidth() {
            return width;
        }

        public List<Runnable> getListeners() {
            return listeners;
        }

        public String getDescription() {
            return description;
        }

        public String getSummary() {
            if (summary == null) {
                summary = low + ".." + high;
            }
            return summary;
        }

        String label() {
            LOG.fine(label);
            return label;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Range that && low == that.low && high == that.high;
        }

        @Override
        public int hashCode() {
            return Objects.hash(low, high);
        }
    }

    public static final class Account {
        private final long id;
        private final String owner;
        private final String note;

        public Account(long id, String owner, String note) {
            this.id = id;
            this.owner = owner;
            this.note = note;
        }

        public long getId() {
            return id;
        }

        public String getOwner() {
            return owner;
        }

        public String getNote() {
            return note;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Account that && id == that.id;
        }

        @Override
        public int hashCode() {
            return Long.hashCode(id);
        }
    }

    public static final class Pair {
        private final String left;
        private final String right;
        private final String comment;

        public Pair(String left, String right, String comment) {
            this.left = left;
            this.right = right;
            this.comment = comment;
        }

        public String getLeft() {
            return left;
        }

        public String getRight() {
            return right;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Pair that && left.equals(that.left) && right.equals(that.right);
        }

        @Override
        public int hashCode() {
            return Objects.hash(left, right);
        }
    }

    public static final class Matching {
        private final String pattern;
        private final boolean ignoreCase;
        private final Pattern compiled;

        public Matching(String pattern, boolean ignoreCase) {
            this.pattern = pattern;
            this.ignoreCase = ignoreCase;
            this.compiled = Pattern.compile(pattern);
        }

        public String getPattern() {
            return pattern;
        }

        public boolean isIgnoreCase() {
            return ignoreCase;
        }

        public Pattern getCompiled() {
            return compiled;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Matching that && pattern.equals(that.pattern) && ignoreCase == that.ignoreCase;
        }

        @Override
        public int hashCode() {
            return Objects.hash(pattern, ignoreCase);
        }
    }
}
