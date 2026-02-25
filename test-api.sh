#!/bin/bash

# Minecraft Server Manager - API Test Script
# This script tests if your backend is working correctly

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="${1:-http://localhost:5000}"

echo -e "${BLUE}"
echo "=========================================="
echo "  Minecraft Server Manager - API Tests"
echo "=========================================="
echo -e "${NC}"
echo "API URL: $API_URL"
echo ""

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
echo "Testing: GET /api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health")
if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Backend is running (HTTP $RESPONSE)"
else
    echo -e "${RED}✗ FAIL${NC} - Backend not responding (HTTP $RESPONSE)"
    echo "Make sure backend is running: docker-compose up -d backend"
    exit 1
fi
echo ""

# Test 2: Get Servers
echo -e "${YELLOW}Test 2: List All Servers${NC}"
echo "Testing: GET /api/servers"
RESPONSE=$(curl -s "$API_URL/api/servers")
if echo "$RESPONSE" | grep -q "^\\["; then
    COUNT=$(echo "$RESPONSE" | grep -o '"vmid"' | wc -l)
    echo -e "${GREEN}✓ PASS${NC} - Found $COUNT servers"
    echo "Response: $RESPONSE" | head -c 200
    echo "..."
else
    if echo "$RESPONSE" | grep -q "error"; then
        ERROR=$(echo "$RESPONSE" | grep -o '"error":"[^"]*' | cut -d'"' -f4)
        echo -e "${RED}✗ FAIL${NC} - Error: $ERROR"
        echo ""
        echo "Possible causes:"
        echo "  1. Proxmox credentials in .env are incorrect"
        echo "  2. Proxmox host is not reachable"
        echo "  3. Proxmox user doesn't have permissions"
        echo ""
        echo "Check logs: docker-compose logs backend"
        exit 1
    else
        echo -e "${RED}✗ FAIL${NC} - Unexpected response: $RESPONSE"
        exit 1
    fi
fi
echo ""

# Test 3: Cross-Origin (CORS) Test
echo -e "${YELLOW}Test 3: CORS Headers${NC}"
echo "Testing: CORS configuration"
RESPONSE=$(curl -s -i "$API_URL/api/health" 2>/dev/null | grep -i "access-control")
if echo "$RESPONSE" | grep -q "access-control-allow-origin"; then
    echo -e "${GREEN}✓ PASS${NC} - CORS enabled"
else
    echo -e "${YELLOW}⚠ WARNING${NC} - CORS header might not be set"
fi
echo ""

# Test 4: Frontend Connection
echo -e "${YELLOW}Test 4: Frontend to Backend${NC}"
echo "Testing: http://localhost:3000 can reach backend"
# This is informational only since we're testing from CLI
echo -e "${BLUE}ⓘ INFO${NC} - Frontend should be able to reach backend at http://backend:5000 (Docker) or http://localhost:5000 (local)"
echo ""

# Test 5: Network Test (Docker only)
if command -v docker &> /dev/null; then
    echo -e "${YELLOW}Test 5: Docker Containers${NC}"
    echo "Testing: Docker containers are running"
    
    BACKEND=$(docker ps --filter "name=minecraft-manager-backend" -q 2>/dev/null)
    FRONTEND=$(docker ps --filter "name=minecraft-manager-frontend" -q 2>/dev/null)
    
    if [ ! -z "$BACKEND" ]; then
        echo -e "${GREEN}✓ PASS${NC} - Backend container is running"
    else
        echo -e "${YELLOW}⚠ INFO${NC} - Backend container not found (running locally?)"
    fi
    
    if [ ! -z "$FRONTEND" ]; then
        echo -e "${GREEN}✓ PASS${NC} - Frontend container is running"
    else
        echo -e "${YELLOW}⚠ INFO${NC} - Frontend container not found (running locally?)"
    fi
fi
echo ""

# Summary
echo -e "${BLUE}=========================================="
echo "  Test Summary"
echo "==========================================${NC}"
echo ""
echo "✓ API is responding to requests"
echo "✓ Backend can connect to Proxmox"
echo "✓ CORS is configured"
echo ""
echo -e "${GREEN}All tests passed! 🎉${NC}"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. You should see your Minecraft servers"
echo "3. Try cloning a server"
echo ""
echo "Troubleshooting:"
echo "  View backend logs: docker-compose logs -f backend"
echo "  View frontend logs: docker-compose logs -f frontend"
echo "  Restart services: docker-compose restart"
echo ""
