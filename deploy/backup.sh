#!/bin/sh
# Daily backup: PostgreSQL dump (custom format) + archive of stored documents.
# Restore DB:  pg_restore -h <host> -U f2a -d f2a_manager --clean --if-exists <file>.dump
set -eu
TS=$(date +%Y%m%d-%H%M%S)
DIR=/backups
mkdir -p "$DIR"
pg_dump -h db -U f2a -d f2a_manager -Fc -f "$DIR/f2a-db-$TS.dump"
[ -d /storage ] && tar -czf "$DIR/f2a-files-$TS.tar.gz" -C /storage . || true
find "$DIR" -type f -mtime +"${BACKUP_KEEP_DAYS:-30}" -delete
echo "Backup $TS done"
