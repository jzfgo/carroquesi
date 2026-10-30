# Pinned so a fresh release cannot enter the image unreviewed. A FROM line,
# not an inline COPY --from, so Dependabot sees the pin and proposes bumps.
FROM ghcr.io/astral-sh/uv:0.13.5 AS uv

FROM python:3.14-slim

WORKDIR /app

COPY --from=uv /uv /usr/local/bin/uv

# Compile bytecode at install time, so cold starts skip it.
# uv reads this during sync, so it must be set before.
ENV UV_COMPILE_BYTECODE=1

# Copy dependency files and install (cached layer)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application source and migration files
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

# Run migrations then start the server.
# Alembic is idempotent — won't re-apply already-applied migrations.
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8080
