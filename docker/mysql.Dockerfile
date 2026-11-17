FROM mysql:8.4
# Source the init script regardless of executable flags on the host checkout.
COPY --chmod=0644 docker/mysql-init.sh /docker-entrypoint-initdb.d/10-create-app-user.sh
