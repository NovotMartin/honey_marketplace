#!/bin/sh
set -eu

mkdir -p /app/data

yarn prisma db push --skip-generate

exec "$@"
