FROM python:3.11-slim

WORKDIR /app

# Install git for cloning
RUN apt-get update -qq && apt-get install -y -qq git && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./

# Create data directory for state
RUN mkdir -p /app/data

# Environment variables (override via docker-compose or --env-file)
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["python3", "-m", "agents.research_daemon"]
CMD ["--interval", "600"]
