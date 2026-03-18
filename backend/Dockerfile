FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

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
