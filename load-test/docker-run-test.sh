#!/bin/bash
echo "=== AWIK NET Load Test (Docker) ==="
docker run --rm --network host -i grafana/k6 run - < k6-load-test.js
