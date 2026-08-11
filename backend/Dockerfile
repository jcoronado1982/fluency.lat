# syntax=docker/dockerfile:1.4
FROM --platform=$BUILDPLATFORM rust:1.95-slim-bookworm as builder
WORKDIR /app

# Configure Rust optimizations and caching
ENV CARGO_HOME=/usr/local/cargo
ENV RUSTUP_HOME=/usr/local/rustup

# Install host compilation tools
RUN apt-get update && apt-get install -y \
    pkg-config \
    perl \
    gcc \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# Receive the target architecture from buildx
ARG TARGETPLATFORM
ARG TARGETARCH

# Install cross-compilation toolchain based on target
RUN if [ "$TARGETARCH" = "arm64" ]; then \
        apt-get update && apt-get install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu && \
        rustup target add aarch64-unknown-linux-gnu; \
    elif [ "$TARGETARCH" = "amd64" ]; then \
        rustup target add x86_64-unknown-linux-gnu; \
    fi

COPY . .

# Build main application
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    if [ "$TARGETARCH" = "arm64" ]; then \
        CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
        CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc \
        CXX_aarch64_unknown_linux_gnu=aarch64-linux-gnu-g++ \
        AR_aarch64_unknown_linux_gnu=aarch64-linux-gnu-ar \
        RUSTFLAGS="-C target-cpu=neoverse-n1" \
        cargo build -p api_main --release --target aarch64-unknown-linux-gnu && \
        cp target/aarch64-unknown-linux-gnu/release/api_main /usr/local/bin/flashcard-backend; \
    elif [ "$TARGETARCH" = "amd64" ]; then \
        RUSTFLAGS="-C target-cpu=x86-64-v3" \
        cargo build -p api_main --release --target x86_64-unknown-linux-gnu && \
        cp target/x86_64-unknown-linux-gnu/release/api_main /usr/local/bin/flashcard-backend; \
    fi

# ========================================================
# Runtime Stage
# ========================================================
FROM debian:bookworm-slim
WORKDIR /app

# Only ca-certificates, sshpass, and openssh-client are required for production.
# libssl is no longer needed since it's statically compiled into the binary.
RUN apt-get update && apt-get install -y \
    ca-certificates \
    sshpass \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/flashcard-backend /usr/local/bin/flashcard-backend

ENV PORT=8080
ENV RUST_LOG=info
EXPOSE 8080

CMD ["flashcard-backend"]
