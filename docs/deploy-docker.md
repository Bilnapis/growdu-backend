# Deploy GrowDu ke VPS dengan Docker

Panduan ini menggunakan Ubuntu 24.04 LTS, Docker Engine, dan Compose plugin.
Tiga container utama menjalankan MySQL 8.4, backend NestJS, dan frontend React
melalui Caddy. Build dilakukan di VPS. Tidak perlu memasang Node.js, MySQL,
Nginx, atau Certbot pada host.

Gunakan satu domain, misalnya `app.example.com`, dengan DNS A (dan AAAA jika
IPv6 tersedia) mengarah langsung ke VPS. Buka port SSH, TCP 80/443, dan opsional
UDP 443 pada firewall penyedia. Port 3000/3306 tidak dipublikasikan. Jangan
menjalankan Nginx atau proxy lain pada port 80/443 bersamaan dengan stack ini.

| Alamat                                | Tujuan                                  |
| ------------------------------------- | --------------------------------------- |
| `https://app.example.com/`            | Frontend React                          |
| `/admin`                              | Panel super-admin frontend              |
| `/api/v1`                             | REST API dan pemeriksaan status backend |
| `/uploads/tenant-logos/...`           | Logo publik                             |
| `/backend-admin`, `/docs`, `/storage` | Ditutup                                 |

AdminJS dinonaktifkan, Swagger dinonaktifkan, dan cookie autentikasi memakai
HTTPS. Caddy memperbarui sertifikat otomatis; data sertifikat disimpan di volume.
API dan UI menggunakan origin yang sama. Backend mempercayai satu hop proxy
karena hanya Caddy yang menjadi pintu masuk publik. Jangan membuka port backend
atau menambah CDN/proxy di depannya tanpa meninjau konfigurasi kepercayaan proxy.

## 1. Pasang Docker pada VPS baru

Login menggunakan akun SSH yang sudah memiliki sudo, misalnya `abillionaire`.
Jalankan perintah berikut di VPS Ubuntu:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Logout dan login SSH kembali agar grup `docker` berlaku. Grup ini memberikan
akses administratif ke host; tambahkan hanya akun pengelola deployment.

```bash
docker version
docker compose version
```

Untuk host dengan Docker yang sudah terpasang, periksa kompatibilitas paket
sebelum mengikuti langkah instalasi. Port yang dipublikasikan Docker dapat
melewati aturan UFW; konfigurasi ini hanya mempublikasikan port Caddy.
Rujukan: [instalasi Docker di Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

## 2. Ambil source dan isi environment

Pertahankan kedua repository sebagai direktori saudara:

```text
GrowDu/
├── growdu-backend/
│   ├── compose.production.yaml
│   └── .env.docker
└── growdu-frontend/
```

Clone menggunakan URL Git masing-masing dan checkout tag/commit yang akan
dirilis. Semua perintah Compose berikut dijalankan dari `growdu-backend/`.

```bash
cd growdu-backend
umask 077
cp .env.docker.example .env.docker
chmod 600 .env.docker
```

Di Windows, salin file dengan `Copy-Item .env.docker.example .env.docker`.
Build lokal dapat dilakukan dengan Docker Desktop pada Windows/macOS atau
Docker Engine pada Linux; perintah administrasi VPS dalam panduan ini memakai Bash.

Edit `.env.docker` menggunakan editor. Isi domain tanpa `https://`, email ACME
yang aktif, dan `GROWDU_IMAGE_TAG` unik untuk rilis, misalnya `release-20261117-1`.
Buat nilai berbeda untuk `MYSQL_ROOT_PASSWORD`, `DB_MIGRATOR_PASSWORD`,
`DB_APP_PASSWORD`, dan `JWT_ACCESS_SECRET`. Jalankan empat kali:

```bash
openssl rand -hex 32
```

Password aplikasi database wajib berupa minimal 64 karakter heksadesimal agar
aman digunakan pada SQL inisialisasi. Jangan memasukkan secret ke `VITE_*`.
Compose meneruskan kredensial hanya ke service yang memerlukannya; backend tidak
menerima password root maupun migrator.

`PUBLIC_BASE_URL`, allowlist CORS, dan `VITE_API_BASE_URL` diturunkan dari
`APP_DOMAIN`. URL API frontend berbentuk `https://DOMAIN/api/v1` dan masuk ke
bundle saat build; perubahan domain memerlukan rebuild frontend. File `.env`
development kedua aplikasi tidak diperlukan dan tidak disalin ke image.

## 3. Build, migrasi, dan hidupkan aplikasi

```bash
docker compose --env-file .env.docker -f compose.production.yaml config --quiet
docker compose --env-file .env.docker -f compose.production.yaml build --pull mysql backend frontend
docker compose --env-file .env.docker -f compose.production.yaml up -d --wait mysql
docker compose --env-file .env.docker -f compose.production.yaml run --rm migrate
docker compose --env-file .env.docker -f compose.production.yaml up -d --wait --no-build
```

**Jalankan setiap langkah setelah langkah sebelumnya berhasil.** Migrasi memakai
hasil kompilasi production dan akun `growdu_migrator`. Schema tidak dibuat oleh
startup backend; `synchronize` dan `migrationsRun` tetap `false`.

Pada volume baru, image MySQL membuat database dan akun migrator, lalu script
inisialisasi membuat `growdu_app` dengan hak SELECT/INSERT/UPDATE/DELETE saja.
Image MySQL dibangun dari `mysql:8.4`; script disalin ke image dengan mode `0644`
agar selalu di-source oleh entrypoint. Tidak ada bind mount script dari host,
sehingga flag executable dan pembatasan mount Docker Desktop tidak menghalangi
inisialisasi akun. Healthcheck memverifikasi login migrator dan aplikasi.
Akun migrator memiliki hak database untuk migrasi, termasuk TRIGGER, tanpa SUPER.
MySQL khusus stack ini mengaktifkan `log_bin_trust_function_creators=1` agar
migrasi histori metrik dapat membuat trigger. Jangan menghapus akun migrator
setelahnya karena trigger memakai akun tersebut sebagai DEFINER.

Inisialisasi user/password hanya berjalan ketika volume MySQL masih kosong.
Mengedit password di `.env.docker` tidak mengganti password pada database yang
sudah ada. Rotasikan melalui SQL administratif lalu sesuaikan environment.
Jika inisialisasi gagal, periksa log; jangan menghapus volume untuk mencoba ulang
pada database yang sudah berisi data.

Periksa status dan log:

```bash
docker compose --env-file .env.docker -f compose.production.yaml ps
docker compose --env-file .env.docker -f compose.production.yaml logs --tail=100 mysql backend frontend
curl --fail https://app.example.com/api/v1
```

Status backend mengembalikan `{"service":"growdu-backend","status":"ok"}`.
Healthcheck backend memeriksa HTTP aplikasi, bukan pemeriksaan SQL berkelanjutan.
Uji HTTPS dari browser juga; healthcheck frontend hanya memeriksa proses Caddy
melalui port internal 8080. Jika sertifikat gagal, periksa DNS, port 80/443, email,
dan log frontend. Hindari pengulangan permintaan sertifikat dengan menghapus volume Caddy.

## 4. Buat akun awal

Buat file sementara `.env.provision` berisi nilai berikut menggunakan editor:

```dotenv
PROVISION_TENANT_NAME=Nama Bimbel
PROVISION_OWNER_NAME=Nama Owner
PROVISION_OWNER_PHONE_NUMBER=081234567890
PROVISION_OWNER_EMAIL=owner@example.com
PROVISION_OWNER_PASSWORD=ISI_PASSWORD_UNIK_MINIMAL_12_KARAKTER
PLATFORM_ADMIN_EMAIL=platform-admin@example.com
PLATFORM_ADMIN_PASSWORD=ISI_PASSWORD_UNIK_YANG_BERBEDA
```

Gunakan Compose plugin terbaru yang mendukung `run --env-from-file`.
File ini diabaikan Git dan tidak dimasukkan ke build context.

```bash
chmod 600 .env.provision
docker compose --env-file .env.docker -f compose.production.yaml run --rm --no-deps --env-from-file .env.provision backend node dist/commands/provision-owner.js
docker compose --env-file .env.docker -f compose.production.yaml run --rm --no-deps --env-from-file .env.provision backend node dist/commands/provision-platform-admin.js
rm .env.provision
```

Perintah langsung menjalankan JavaScript hasil build; tidak membutuhkan Nest CLI
atau dependency development di image runtime. Akun super-admin ini digunakan
untuk frontend `/admin`, terpisah dari AdminJS yang dinonaktifkan.

## 5. Penyimpanan dan backup

| Volume                       | Isi                                         |
| ---------------------------- | ------------------------------------------- |
| `mysql_data`                 | Database MySQL                              |
| `uploads`                    | Logo publik di `/app/uploads`               |
| `private_storage`            | Bukti invoice dan payroll di `/app/storage` |
| `caddy_data`, `caddy_config` | Sertifikat dan konfigurasi runtime Caddy    |

Nama aktual volume memakai prefix `growdu-production_`. Pertahankan nama proyek
Compose agar volume yang sama digunakan saat update. Bukti pembayaran tidak
di-mount ke Caddy dan hanya dapat diunduh melalui endpoint API yang terotorisasi.
Image menyiapkan direktori volume aplikasi dengan pemilik user `node`.

Untuk backup konsisten antara database dan file, hentikan frontend/backend
sementara. Jalankan dari `growdu-backend/` dan pastikan setiap perintah berhasil:

```bash
umask 077
GROWDU_BACKUP_DIR="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$GROWDU_BACKUP_DIR"
docker compose --env-file .env.docker -f compose.production.yaml stop frontend backend
docker compose --env-file .env.docker -f compose.production.yaml exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --user=root --single-transaction --routines --triggers --events --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' > "$GROWDU_BACKUP_DIR/database.sql"
docker compose --env-file .env.docker -f compose.production.yaml run --rm -T --no-deps backend tar -czf - -C /app uploads storage > "$GROWDU_BACKUP_DIR/files.tar.gz"
docker compose --env-file .env.docker -f compose.production.yaml run --rm -T --no-deps --entrypoint tar frontend -czf - -C / data config > "$GROWDU_BACKUP_DIR/caddy.tar.gz"
cp .env.docker "$GROWDU_BACKUP_DIR/environment"
docker compose --env-file .env.docker -f compose.production.yaml up -d --wait --no-build
```

Periksa dump tidak kosong dan arsip dapat dibaca dengan `tar -tzf`. Simpan
backup per tanggal/rilis, salin ke penyimpanan di luar VPS, dan lindungi dengan
enkripsi karena berisi data pengguna, secret, dan private key TLS. Jangan hanya
mengandalkan volume pada disk VPS sebagai backup.

Untuk **restore pada database/volume baru yang masih kosong**, gunakan secret,
nama database, domain, dan image rilis dari backup. Hidupkan MySQL hingga sehat,
biarkan inisialisasi membuat kedua akun, lalu impor sebelum menyalakan aplikasi:

```bash
GROWDU_BACKUP_DIR=backups/GANTI_DENGAN_FOLDER_BACKUP
docker compose --env-file .env.docker -f compose.production.yaml up -d --wait mysql
docker compose --env-file .env.docker -f compose.production.yaml exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root "$MYSQL_DATABASE"' < "$GROWDU_BACKUP_DIR/database.sql"
docker compose --env-file .env.docker -f compose.production.yaml run --rm -T --no-deps backend tar -xzf - -C /app < "$GROWDU_BACKUP_DIR/files.tar.gz"
docker compose --env-file .env.docker -f compose.production.yaml run --rm -T --no-deps --entrypoint tar frontend -xzf - -C / < "$GROWDU_BACKUP_DIR/caddy.tar.gz"
docker compose --env-file .env.docker -f compose.production.yaml run --rm migrate npm run typeorm:prod -- migration:show
docker compose --env-file .env.docker -f compose.production.yaml up -d --wait --no-build
```

Restore dump dapat menimpa tabel; jangan menjalankannya pada database aktif.
Validasi login, logo, dan unduhan bukti setelah restore. Jalankan prosedur restore
terlebih dahulu pada VPS uji yang terpisah sebelum mengandalkannya untuk pemulihan.

## 6. Update dan rollback

Catat tag image dan ref Git kedua aplikasi pada setiap rilis. Jangan menimpa tag
image rilis lama. Ambil source terbaru dan ubah `GROWDU_IMAGE_TAG` ke tag baru.
Build sebelum menghentikan aplikasi agar kegagalan build tidak menyebabkan downtime:

```bash
docker compose --env-file .env.docker -f compose.production.yaml build --pull mysql backend frontend
docker compose --env-file .env.docker -f compose.production.yaml stop frontend backend
```

Buat backup sesuai langkah 5 dengan aplikasi tetap berhenti; tunda perintah
menyalakan aplikasi sampai migrasi berikut berhasil:

```bash
docker compose --env-file .env.docker -f compose.production.yaml run --rm migrate
docker compose --env-file .env.docker -f compose.production.yaml up -d --wait --no-build
```

Jika migrasi gagal, aplikasi tetap dihentikan. Periksa log/error dan status migrasi:

```bash
docker compose --env-file .env.docker -f compose.production.yaml run --rm migrate npm run typeorm:prod -- migration:show
```

Jangan menjalankan rollback schema secara otomatis. DDL MySQL tidak seluruhnya
transaksional; migrasi yang gagal dapat meninggalkan perubahan parsial.
Tinjau migration dan dampak datanya. Jika downgrade kompatibel dan telah disetujui,
perintah berikut membatalkan **satu** migrasi terakhir menggunakan image rilis baru:

```bash
docker compose --env-file .env.docker -f compose.production.yaml run --rm migrate npm run typeorm:prod -- migration:revert
```

Untuk rollback aplikasi, kembalikan ref source, konfigurasi Compose, dan
`GROWDU_IMAGE_TAG` ke rilis sebelumnya lalu jalankan `up -d --wait --no-build`.
Ini memerlukan image lama masih tersedia dan schema yang kompatibel. Jika schema
tidak dapat dikembalikan dengan aman, gunakan prosedur restore dari backup yang
telah diverifikasi. Jangan menghapus volume atau image rilis lama saat pemulihan.

`docker compose ... down` mempertahankan named volume. **Jangan gunakan `down -v`
atau prune volume** pada deployment yang datanya masih dibutuhkan.

## 7. Verifikasi rilis

- Semua service utama sehat; database dan port backend tidak dapat diakses publik.
- HTTPS valid dan HTTP diarahkan ke HTTPS.
- Login, refresh session, logout, dan panel frontend `/admin` bekerja.
- Refresh pada route seperti `/settings/bimbel` tetap membuka React.
- `/backend-admin/login`, `/docs`, dan `/storage/...` mengembalikan 404.
- Upload logo berfungsi dan URL publik menggunakan domain HTTPS.
- Bukti invoice/payroll hanya dapat diakses dengan otorisasi yang sesuai.
- Database, logo, dan bukti tetap tersedia setelah container dibuat ulang tanpa
  menghapus volume.
- Jalankan migrasi ulang untuk memastikan tidak ada migrasi tertunda.

Sebelum merilis source, jalankan lint/test/build backend dan typecheck/lint/build
frontend sesuai `AGENTS.md`. Smoke test Docker memerlukan Docker Engine yang
aktif; pemeriksaan TypeScript saja tidak membuktikan container dapat berjalan.

Rujukan: [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/),
[Compose run](https://docs.docker.com/reference/cli/docker/compose/run/),
[image MySQL](https://hub.docker.com/_/mysql),
[Caddy HTTPS](https://caddyserver.com/docs/automatic-https), dan
[Vite environment](https://vite.dev/guide/env-and-mode).

## Hasil validasi lokal — 17 November 2026

Validasi dilakukan pada Docker Desktop dengan engine Linux ARM64, memakai project,
secret, database, volume, dan port localhost khusus pengujian. Data development
tidak digunakan. Hasil yang berhasil diperiksa:

- Build ketiga image production dari lockfile, termasuk MySQL dengan init script
  di dalam image; ketiga container mencapai status healthy.
- Lima belas migration pada database kosong, kemudian migrasi ulang menghasilkan
  `No migrations are pending`.
- Healthcheck menolak akun aplikasi yang sengaja dikunci dan kembali berhasil
  setelah dibuka; script init memiliki mode `0644`.
- Provisioning owner/super-admin dari runtime production; HTTPS lokal dengan CA
  terverifikasi, redirect HTTP, route React, login, refresh/logout, pembuatan siswa,
  dan upload serta akses logo publik.
- Backend non-root, akun runtime ditolak saat mencoba DDL, trigger histori bekerja,
  dan port backend/database tidak dipublikasikan.
- Database, logo, kedua direktori bukti privat, dan CA Caddy tetap tersedia setelah
  seluruh container dibuat ulang; path privat tetap ditutup di reverse proxy.
- Lint backend/frontend, typecheck frontend, build kedua aplikasi di Docker,
  dan 171 unit test backend berhasil.

Sertifikat publik ACME untuk domain VPS dan arsitektur AMD64 belum diuji pada
validasi lokal ini. Saat build, npm audit juga melaporkan 7 temuan high pada
dependency production backend dan 4 high pada dependency build frontend. Dependency
tidak di-upgrade sebagai bagian dari perbaikan Docker ini; temuan tersebut perlu
ditinjau terpisah sebelum rilis production.
