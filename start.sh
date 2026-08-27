#!/bin/sh
set -e

cd /app/api
npx prisma migrate deploy

cd /app/api
npm start &

cd /app/worker
npm start &

wait -n