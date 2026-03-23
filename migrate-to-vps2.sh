#!/bin/bash
# Migration script for VPS2 (45.129.86.105)
# Backend: port 2000 | Admin: port 2001 | Kiosk: port 2002
set -e

echo "=== Step 1: Install Docker ==="
apt update -y
apt install -y curl git
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin

echo "=== Step 2: Clone Repo ==="
mkdir -p /var/www
cd /var/www
git clone https://github.com/zso61976-sys/-coaching-center.git coaching-center
cd coaching-center

echo "=== Step 3: Copy env and docker-compose for VPS2 ==="
cp backend/.env.vps2 backend/.env.vps2
# .env.vps2 and docker-compose-vps2.yml are already in repo after push

echo "=== Step 4: Start DB and Redis first ==="
cd docker
docker compose -f docker-compose-vps2.yml up -d postgres redis

echo "Waiting for DB to be ready..."
sleep 15

echo "=== Step 5: Restore Database ==="
docker exec -i coaching_db psql -U attendance attendance_db < /tmp/coaching_backup.sql
echo "DB restored!"

echo "=== Step 6: Build and Start All Services ==="
docker compose -f docker-compose-vps2.yml build backend admin kiosk
docker compose -f docker-compose-vps2.yml up -d

echo "=== Done! ==="
echo "Backend:  http://45.129.86.105:2000"
echo "Admin:    http://45.129.86.105:2001"
echo "Kiosk:    http://45.129.86.105:2002"
docker compose -f docker-compose-vps2.yml ps
