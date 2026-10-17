# Runs the nitpicker gate in any CI without a language toolchain on the host.
# Build from the repository root:  docker build -t nitpicker .
# Run against a checkout:          docker run --rm -v "$PWD":/work nitpicker
FROM node:22.14.0-slim

# The gate diffs against the merge base, so git is required.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The base dependency install runs the package manager the project uses: Corepack serves pnpm and
# Yarn, Bun comes from npm. The Corepack cache is writable for any user (docker run --user).
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable \
    && mkdir -m 1777 /opt/corepack \
    && npm install --global bun@1.4.2

# Install the package from the repo source with its locked dependencies.
COPY package.json package-lock.json .npmrc LICENSE README.md /opt/nitpicker/
COPY core/ /opt/nitpicker/core/
COPY shared/ /opt/nitpicker/shared/
COPY languages/ /opt/nitpicker/languages/
RUN cd /opt/nitpicker \
    && npm ci --omit=dev --no-audit --no-fund \
    && ln -s /opt/nitpicker/core/cli.mjs /usr/local/bin/nitpicker

# The mounted checkout is owned by the host user, not by this container's user.
RUN git config --system --add safe.directory /work

WORKDIR /work
ENTRYPOINT ["nitpicker"]
CMD ["--help"]
