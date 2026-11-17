#!/bin/bash
# Run by the official MySQL entrypoint on an empty data volume.
(
  set -eu

  if [[ ! "${MYSQL_DATABASE}" =~ ^[a-zA-Z0-9_]+$ ]]; then
    echo 'MYSQL_DATABASE must contain only letters, digits, and underscores.' >&2
    exit 1
  fi

  # This restriction makes interpolation into the initialization SQL safe.
  if [[ ! "${DB_APP_PASSWORD}" =~ ^[a-fA-F0-9]{64,}$ ]]; then
    echo 'DB_APP_PASSWORD must contain at least 64 hexadecimal characters.' >&2
    exit 1
  fi

  MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql --protocol=socket --user=root --database="${MYSQL_DATABASE}" <<SQL
CREATE USER 'growdu_app'@'%' IDENTIFIED BY '${DB_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO 'growdu_app'@'%';
SQL
)
