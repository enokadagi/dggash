#!/bin/bash
echo "=== AWIK NET Load Test ==="
echo "Make sure the API is running on http://localhost:3001"
echo ""

if ! command -v k6 &> /dev/null; then
  echo "k6 not found. Install from: https://grafana.com/docs/k6/latest/set-up/install-k6/"
  echo "Or run: docker run --rm -i grafana/k6 run - < k6-load-test.js"
  exit 1
fi

k6 run k6-load-test.js
