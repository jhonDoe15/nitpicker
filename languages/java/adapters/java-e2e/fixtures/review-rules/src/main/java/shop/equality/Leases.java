package shop.equality;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class Leases {
    private Leases() {
    }

    public static final class Noted {
        private final String owner;
        private final String scope;
        private final String region;
        private final Optional<String> note;

        public Noted(String owner, String scope, String region, String note) {
            this.owner = owner;
            this.scope = scope;
            this.region = region;
            this.note = Optional.of(note);
        }

        public String getOwner() {
            return owner;
        }

        public String getScope() {
            return scope;
        }

        public String getRegion() {
            return region;
        }

        public Optional<String> getNote() {
            return note;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Noted that && owner.equals(that.owner) && scope.equals(that.scope)
                && region.equals(that.region);
        }

        @Override
        public int hashCode() {
            return Objects.hash(owner, scope, region);
        }
    }

    public static final class Stamped {
        private final String owner;
        private final String scope;
        private final String region;
        private final Instant issuedTime;

        public Stamped(String owner, String scope, String region, long issuedTime) {
            this.owner = owner;
            this.scope = scope;
            this.region = region;
            this.issuedTime = Instant.ofEpochMilli(issuedTime);
        }

        public String getOwner() {
            return owner;
        }

        public String getScope() {
            return scope;
        }

        public String getRegion() {
            return region;
        }

        public Instant getIssuedTime() {
            return issuedTime;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Stamped that && owner.equals(that.owner) && scope.equals(that.scope)
                && region.equals(that.region);
        }

        @Override
        public int hashCode() {
            return Objects.hash(owner, scope, region);
        }
    }

    public static final class Expiring {
        private final String owner;
        private final String scope;
        private final String region;
        private final int timeToLive;

        public Expiring(String owner, String scope, String region, int timeToLive) {
            this.owner = owner;
            this.scope = scope;
            this.region = region;
            this.timeToLive = timeToLive;
        }

        public String getOwner() {
            return owner;
        }

        public String getScope() {
            return scope;
        }

        public String getRegion() {
            return region;
        }

        public int getTimeToLive() {
            return timeToLive;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Expiring that && owner.equals(that.owner) && scope.equals(that.scope)
                && region.equals(that.region);
        }

        @Override
        public int hashCode() {
            return Objects.hash(owner, scope, region);
        }
    }

    public static final class Flagged {
        private final String owner;
        private final String scope;
        private final String region;
        private final boolean ephemeral;

        public Flagged(String owner, String scope, String region, boolean ephemeral) {
            this.owner = owner;
            this.scope = scope;
            this.region = region;
            this.ephemeral = ephemeral;
        }

        public String getOwner() {
            return owner;
        }

        public String getScope() {
            return scope;
        }

        public String getRegion() {
            return region;
        }

        public boolean isEphemeral() {
            return ephemeral;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Flagged that && owner.equals(that.owner) && scope.equals(that.scope)
                && region.equals(that.region);
        }

        @Override
        public int hashCode() {
            return Objects.hash(owner, scope, region);
        }
    }

    public static final class Viewed {
        private final String owner;
        private final String scope;
        private final String region;
        private final byte[] rawBytes;

        public Viewed(String owner, String scope, String region, byte[] rawBytes) {
            this.owner = owner;
            this.scope = scope;
            this.region = region;
            this.rawBytes = rawBytes;
        }

        public String getOwner() {
            return owner;
        }

        public String getScope() {
            return scope;
        }

        public String getRegion() {
            return region;
        }

        public byte[] getRawBytes() {
            return rawBytes;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Viewed that && owner.equals(that.owner) && scope.equals(that.scope)
                && region.equals(that.region);
        }

        @Override
        public int hashCode() {
            return Objects.hash(owner, scope, region);
        }
    }

    public static final class Placed {
        private final String owner;
        private final String scope;
        private final String region;
        private final List<String> addresses;

        public Placed(String owner, String scope, String region, List<String> addresses) {
            this.owner = owner;
            this.scope = scope;
            this.region = region;
            this.addresses = addresses;
        }

        public String getOwner() {
            return owner;
        }

        public String getScope() {
            return scope;
        }

        public String getRegion() {
            return region;
        }

        public List<String> getAddresses() {
            return addresses;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Placed that && owner.equals(that.owner) && scope.equals(that.scope)
                && region.equals(that.region);
        }

        @Override
        public int hashCode() {
            return Objects.hash(owner, scope, region);
        }
    }

    public static final class Sparse {
        private final String owner;
        private final String scope;
        private final String region;
        private final String zone;
        private final String tier;

        public Sparse(String owner, String scope, String region, String zone, String tier) {
            this.owner = owner;
            this.scope = scope;
            this.region = region;
            this.zone = zone;
            this.tier = tier;
        }

        public String getOwner() {
            return owner;
        }

        public String getScope() {
            return scope;
        }

        public String getRegion() {
            return region;
        }

        public String getZone() {
            return zone;
        }

        public String getTier() {
            return tier;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Sparse that && owner.equals(that.owner) && scope.equals(that.scope)
                && region.equals(that.region);
        }

        @Override
        public int hashCode() {
            return Objects.hash(owner, scope, region);
        }
    }
}
