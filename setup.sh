#!/bin/bash
set -e

echo ""
echo "  ops-hub — quick setup"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "  [ERROR] Docker is not installed."
    echo "  Install: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check Docker Compose
if ! docker compose version &> /dev/null 2>&1; then
    echo "  [ERROR] Docker Compose is not available."
    echo "  Update Docker to the latest version."
    exit 1
fi

# Create .env if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    # Generate random password
    PASS=$(head -c 12 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 12)
    sed -i "s/CHANGE_ME_123/$PASS/" .env
    echo "  Created .env with random password: $PASS"
    echo "  Save this password!"
    echo ""
fi

# Build and start
echo "  Building Docker image..."
docker compose build

echo "  Starting services..."
docker compose up -d

echo ""
echo "  ====================================="
echo "  ops-hub is running!"
echo "  Open: http://localhost:${PORT:-8080}"
echo "  ====================================="
echo ""
