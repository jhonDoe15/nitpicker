# Runs the nitpicker gate in any CI without a language toolchain on the host. One image per preset,
# chosen with --target; build from the repository root:
#   docker build --target typescript -t nitpicker:typescript .   TypeScript and JavaScript (the default)
#   docker build --target jvm -t nitpicker:jvm .                 Java and Kotlin, Gradle and Maven
#   docker build --target python -t nitpicker:python .           Python with uv and Poetry
#   docker build --target all -t nitpicker:all .                 every toolchain
# Run against a checkout:  docker run --rm -v "$PWD":/work nitpicker:typescript
# Every base image is pinned to an exact version; bump the versions here together.

FROM node:24.22.1-bookworm-slim AS base

LABEL org.opencontainers.image.title="nitpicker" \
      org.opencontainers.image.description="The nitpicker quality gate with a preset's toolchain" \
      org.opencontainers.image.source="https://github.com/jhonDoe15/nitpicker" \
      org.opencontainers.image.licenses="MIT"

# The gate diffs against the merge base, so git is required; mutation testing (Stryker, PIT) looks up
# its child processes with ps.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates procps \
    && rm -rf /var/lib/apt/lists/*

# The base dependency install runs the package manager the project uses: Corepack serves pnpm and
# Yarn, Bun comes from npm. The Corepack cache is writable for any user (docker run --user), and so
# is the home directory that holds the package managers' caches. The build steps leave nothing
# behind there, since files owned by root would block another user.
ENV COREPACK_HOME=/opt/corepack \
    HOME=/home/nitpicker
RUN corepack enable \
    && mkdir -m 1777 /opt/corepack /home/nitpicker \
    && npm install --global bun@1.4.2 \
    && rm -rf /home/nitpicker/.npm

# Install the package from the repo source with its locked dependencies.
COPY package.json package-lock.json .npmrc LICENSE README.md /opt/nitpicker/
COPY core/ /opt/nitpicker/core/
COPY shared/ /opt/nitpicker/shared/
COPY languages/ /opt/nitpicker/languages/
RUN cd /opt/nitpicker \
    && npm ci --omit=dev --no-audit --no-fund \
    && rm -rf /home/nitpicker/.npm \
    && ln -s /opt/nitpicker/core/cli.mjs /usr/local/bin/nitpicker

# The mounted checkout is owned by the host user, not by this container's user.
RUN git config --system --add safe.directory /work

WORKDIR /work
ENTRYPOINT ["nitpicker"]
CMD ["--help"]

# The JVM toolchain: Temurin JDK 21 (the Java the Java and Kotlin presets need), plus Maven and
# Gradle for projects without a wrapper. A project's own mvnw and gradlew win when it has them.
FROM eclipse-temurin:21.0.12_8-jdk-noble AS jdk
FROM maven:3.9.16-eclipse-temurin-21-noble AS maven
FROM gradle:8.14.3-jdk21-noble AS gradle

FROM scratch AS jvm-files
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
COPY --from=maven /usr/share/maven /opt/maven
COPY --from=gradle /opt/gradle /opt/gradle

FROM base AS jvm
COPY --from=jvm-files /opt/ /opt/
ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:/opt/maven/bin:/opt/gradle/bin:${PATH}

# The Python toolchain: uv, CPython 3.13 managed by uv (more versions download on demand into the
# writable /opt/python) and Poetry. The project's own tools (ruff, mypy, pytest, coverage) come from
# the environment that `uv sync` or `poetry install` creates in the mounted checkout.
FROM base AS python
ENV UV_PYTHON_INSTALL_DIR=/opt/python \
    UV_TOOL_DIR=/opt/uv-tools \
    UV_TOOL_BIN_DIR=/usr/local/bin \
    UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /uvx /usr/local/bin/
RUN mkdir -m 1777 /opt/python \
    && uv python install 3.13.12 \
    && ln -s "$(uv python find 3.13)" /usr/local/bin/python3 \
    && ln -s python3 /usr/local/bin/python \
    && uv tool install poetry==2.4.3 \
    && rm -rf /home/nitpicker/.cache /home/nitpicker/.local

FROM python AS all
COPY --from=jvm-files /opt/ /opt/
ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:/opt/maven/bin:/opt/gradle/bin:${PATH}

# The last stage is the default target: TypeScript and JavaScript, as before.
FROM base AS typescript
