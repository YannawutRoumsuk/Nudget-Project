FROM postgres:18-alpine

RUN apk add --no-cache aws-cli bash coreutils curl jq

WORKDIR /app

COPY scripts/backup-postgres.sh scripts/verify-postgres-backup.sh ./scripts/
RUN chmod +x ./scripts/backup-postgres.sh ./scripts/verify-postgres-backup.sh

CMD ["/app/scripts/backup-postgres.sh"]
