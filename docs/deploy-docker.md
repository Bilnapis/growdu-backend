# Deploy GrowDu ke VPS dengan Docker

Panduan ini menggunakan Ubuntu 24.04 LTS, Docker Engine, dan Compose plugin.
Tiga container utama menjalankan MySQL 8.4, backend NestJS, dan frontend React
melalui Caddy. Build dilakukan di VPS. Tidak perlu memasang Node.js, MySQL,
Nginx, atau Certbot pada host.

Panduan ini disiapkan untuk IP publik VPS **`139.190.107.136`**, tanpa domain.
Pastikan IP tersebut tetap terpasang pada VPS. Buka port SSH, TCP 80/443, dan
opsional UDP 443 pada firewall penyedia. Izinkan koneksi keluar HTTPS untuk
menghubungi layanan sertifikat. Port 3000/3306 tidak dipublikasikan. Jangan
menjalankan Nginx atau proxy lain pada port 80/443 bersamaan dengan stack ini.

| Alamat                                | Tujuan                                  |
| ------------------------------------- | --------------------------------------- |
| `https://139.190.107.136/`            | Frontend React                          |
| `/admin`                              | Panel super-admin frontend              |
| `/api/v1`                             | REST API dan pemeriksaan status backend |
| `/uploads/tenant-logos/...`           | Logo publik                             |
| `/backend-admin`, `/docs`, `/storage` | Ditutup                                 |

AdminJS dinonaktifkan, Swagger dinonaktifkan, dan cookie autentikasi memakai
HTTPS. Caddy memperbarui sertifikat otomatis; data sertifikat disimpan di volume.
Untuk IP publik, gunakan issuer Let's Encrypt dengan profil `shortlived` sesuai
langkah 2.1. Sertifikat IP berlaku 160 jam (sekitar enam hari), sehingga Caddy
dan akses validasi port 80/443 harus tetap tersedia untuk pembaruan otomatis.
[Rujukan sertifikat IP Let's Encrypt](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability/).

API dan UI menggunakan origin yang sama. Backend mempercayai satu hop proxy
karena hanya Caddy yang menjadi pintu masuk publik. Jangan membuka port backend
atau menambah CDN/proxy di depannya tanpa meninjau konfigurasi kepercayaan proxy.

## 1. Pasang Docker pada VPS baru

Login menggunakan akun SSH yang sudah memiliki sudo, misalnya `abillionaire`.
Jika memakai private key `abillionaire.pem`, jalankan dari terminal lokal pada
folder key tersebut:

```bash
chmod 600 abillionaire.pem
ssh -i abillionaire.pem abillionaire@139.190.107.136
```

Sesuaikan nama key dan username jika berbeda. Private key tetap di komputer
lokal. Setelah masuk, jalankan perintah berikut **di VPS Ubuntu 24.04**:

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

`git clone` berarti mengunduh salinan kode dari GitHub ke VPS. Backend dan
frontend berada di dua repository berbeda. Untuk setup ini, gunakan branch
`feat/tutor-payroll`, yaitu branch lokal yang saat ini memuat konfigurasi Docker.
Pastikan perubahan yang akan dirilis sudah di-commit dan di-push ke branch
tersebut pada kedua repository dari komputer lokal.

Setelah login SSH, jalankan perintah berikut **di terminal VPS**. Perintah ini
membuat folder `GrowDu` di direktori home akun VPS, lalu mengunduh kedua aplikasi:

```bash
mkdir -p ~/GrowDu
cd ~/GrowDu
git clone --branch feat/tutor-payroll https://github.com/Bilnapis/growdu-backend.git growdu-backend
git clone --branch feat/tutor-payroll https://github.com/Bilnapis/growdu-frontend.git growdu-frontend
```

Repository frontend sudah menggunakan nama `growdu-frontend`; argumen terakhir
`growdu-frontend` menentukan nama folder hasil clone yang dibutuhkan Compose. Jika folder hasil
clone sudah ada di VPS, gunakan folder tersebut dan periksa branch-nya sebelum
melanjutkan; jangan menjalankan clone lagi ke folder yang sama.

`--branch feat/tutor-payroll` memilih cabang kode yang akan dipasang. Tag atau
commit adalah penanda versi tertentu untuk rilis; pada setup pertama ini,
perintah di atas sudah memilih branch tersebut. Catat versi yang terunduh
untuk memudahkan update atau rollback:

```bash
git -C growdu-backend rev-parse --short HEAD
git -C growdu-frontend rev-parse --short HEAD
```

Setelah kedua clone berhasil, lanjutkan dari folder backend. Semua perintah
Compose berikut dijalankan dari `~/GrowDu/growdu-backend/`:

```bash
cd growdu-backend
umask 077
cp .env.docker.example .env.docker
chmod 600 .env.docker
```

Di Windows, salin file dengan `Copy-Item .env.docker.example .env.docker`.
Build lokal dapat dilakukan dengan Docker Desktop pada Windows/macOS atau
Docker Engine pada Linux; perintah administrasi VPS dalam panduan ini memakai Bash.

Edit `.env.docker` menggunakan editor. Isi host aplikasi dengan IP VPS, tanpa
`https://`, port, atau path. Nama variable `APP_DOMAIN` tetap digunakan untuk
host, termasuk ketika nilainya berupa IP:

```dotenv
APP_DOMAIN=139.190.107.136
ACME_EMAIL=GANTI_DENGAN_EMAIL_AKTIF
GROWDU_IMAGE_TAG=release-20261117-1
```

Ganti `ACME_EMAIL` dengan email aktif dan gunakan tag image unik untuk setiap rilis.
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
`APP_DOMAIN`. Untuk IP ini, nilainya menjadi:

| Konfigurasi         | Nilai                            |
| ------------------- | -------------------------------- |
| `PUBLIC_BASE_URL`   | `https://139.190.107.136`        |
| `FRONTEND_ORIGINS`  | `https://139.190.107.136`        |
| `VITE_API_BASE_URL` | `https://139.190.107.136/api/v1` |

Compose mengisi ketiganya secara otomatis; cukup atur `APP_DOMAIN`. URL API
masuk ke bundle saat build, sehingga perubahan IP/domain memerlukan rebuild
frontend dan penerapan ulang environment backend. File `.env` development kedua
aplikasi tidak diperlukan dan tidak disalin ke image. Pertahankan HTTPS dan
cookie Secure agar login serta refresh session bekerja.

### 2.1. Siapkan Caddy untuk sertifikat IP

**Lakukan penyesuaian source berikut sebelum build.** Caddyfile bawaan repository
menggunakan konfigurasi domain; mengganti `.env.docker` saja belum menyiapkan
sertifikat IP publik. Dari direktori backend, buka
`../growdu-frontend/docker/Caddyfile` menggunakan editor.

Ubah blok global paling atas menjadi:

```caddyfile
{
	email {$ACME_EMAIL}
	admin off
	default_sni {$APP_DOMAIN}
}
```

Di dalam blok situs `{$APP_DOMAIN}`, sisipkan blok berikut tepat sebelum baris
`encode zstd gzip`:

```caddyfile
tls {
	issuer acme https://acme-v02.api.letsencrypt.org/directory {
		profile shortlived
	}
}
```

Pertahankan seluruh handler API, uploads, file statis, route React, path privat,
dan listener healthcheck `:8080` yang sudah ada. Simpan file source tersebut;
Dockerfile frontend menyalinnya ke image pada langkah build. Catat atau commit
perubahan Caddy ini di repository frontend agar ikut pada rilis berikutnya.

`default_sni` membantu memilih sertifikat IP ketika browser tidak mengirim nama
SNI, termasuk saat Caddy berjalan di belakang jaringan Docker/NAT. Issuer ACME
dipilih secara eksplisit agar sertifikat IP diminta dari Let's Encrypt dengan
profil yang sesuai. Tidak diperlukan record DNS untuk IP ini.
Rujukan: [opsi default_sni](https://caddyserver.com/docs/caddyfile/options#default-sni)
dan [issuer ACME Caddy](https://caddyserver.com/docs/caddyfile/directives/tls#acme).

Gunakan image Caddy 2 terbaru melalui `build --pull` pada langkah berikut. Jangan
mengubah issuer menjadi `internal` untuk akses publik: sertifikat internal hanya
dipercaya oleh perangkat yang memasang CA tersebut. Penerbitan sertifikat IP
publik harus dijalankan pada VPS `139.190.107.136`, dengan port validasi tersedia.

## 3. Build, migrasi, dan hidupkan aplikasi

```bash
docker compose --env-file .env.docker -f compose.production.yaml config --quiet
docker compose --env-file .env.docker -f compose.production.yaml build --pull mysql backend frontend
docker compose --env-file .env.docker -f compose.production.yaml run --rm --no-deps frontend caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file .env.docker -f compose.production.yaml up -d --wait mysql
docker compose --env-file .env.docker -f compose.production.yaml run --rm migrate
docker compose --env-file .env.docker -f compose.production.yaml up -d --wait --no-build
```

**Jalankan setiap langkah setelah langkah sebelumnya berhasil.** Migrasi memakai
hasil kompilasi production dan akun `growdu_migrator`. Schema tidak dibuat oleh
startup backend; `synchronize` dan `migrationsRun` tetap `false`.
Perintah `caddy adapt` memeriksa parsing konfigurasi dan menampilkan JSON; periksa
bahwa issuer memakai `shortlived` dan default SNI adalah `139.190.107.136`.
Pemeriksaan ini belum menerbitkan atau memverifikasi sertifikat publik.

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
```

Kemudian periksa dari komputer lokal melalui internet:

```bash
curl --head http://139.190.107.136
curl --fail --show-error https://139.190.107.136/api/v1
```

HTTP harus mengarah ke HTTPS. Pemeriksaan HTTPS harus berhasil dengan validasi
sertifikat normal; jangan menambahkan `-k`/`--insecure`. Buka
`https://139.190.107.136` dan `https://139.190.107.136/admin` di browser untuk
menguji akun owner dan super-admin setelah provisioning pada langkah 4.

Status backend mengembalikan `{"service":"growdu-backend","status":"ok"}`.
Healthcheck backend memeriksa HTTP
aplikasi, bukan pemeriksaan SQL berkelanjutan.
Uji HTTPS dari browser juga; healthcheck frontend hanya memeriksa proses Caddy
melalui port internal 8080. Jika sertifikat gagal, periksa penetapan IP pada VPS,
akses publik port 80/443, email, profil `shortlived`, dan log frontend. Jika
handshake mencari sertifikat untuk IP container, periksa `default_sni` dan
pastikan frontend sudah dibangun ulang setelah Caddyfile diedit. Hindari
pengulangan permintaan sertifikat dengan menghapus volume Caddy.

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
nama database, host/IP aplikasi, dan image rilis dari backup. Hidupkan MySQL hingga sehat,
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
- Upload logo berfungsi dan URL publik memakai `https://139.190.107.136`.
- Bukti invoice/payroll hanya dapat diakses dengan otorisasi yang sesuai.
- Database, logo, dan bukti tetap tersedia setelah container dibuat ulang tanpa
  menghapus volume.
- Jalankan migrasi ulang untuk memastikan tidak ada migrasi tertunda.

Sebelum merilis source, jalankan lint/test/build backend dan typecheck/lint/build
frontend sesuai `AGENTS.md`. Smoke test Docker memerlukan Docker Engine yang
aktif; pemeriksaan TypeScript saja tidak membuktikan container dapat berjalan.

## 8. Beralih ke domain setelah tersedia

Arahkan DNS A domain ke `139.190.107.136`, lalu ganti `APP_DOMAIN` dengan domain
tanpa protokol atau path. Hapus blok `tls` khusus `shortlived` pada Caddyfile
untuk kembali ke issuer domain bawaan; `default_sni {$APP_DOMAIN}` dapat
dipertahankan. Ikuti proses update pada langkah 6, termasuk rebuild frontend
dan penerapan ulang environment backend. Pertahankan nama project Compose,
database, secret, serta seluruh volume agar data tetap tersedia.

Login kembali pada host baru dan periksa logo/tautan yang tersimpan dengan URL
IP absolut. Unggah ulang atau perbarui URL logo melalui pengaturan jika masih
mengarah ke host lama.

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

Contoh Caddy untuk `139.190.107.136` juga lolos parsing pada Caddy 2.11.9 dan
pengujian TLS tanpa SNI dengan CA lokal dalam Docker yang terisolasi. Seluruh
contoh perintah Bash pada panduan lolos pemeriksaan sintaks.

Sertifikat publik ACME untuk IP/domain VPS dan arsitektur AMD64 belum diuji pada
validasi lokal ini. Penerbitan sertifikat publik dan pemeriksaan akses internet
tetap dilakukan pada VPS. Saat build, npm audit juga melaporkan 7 temuan high pada
dependency production backend dan 4 high pada dependency build frontend. Dependency
tidak di-upgrade sebagai bagian dari perbaikan Docker ini; temuan tersebut perlu
ditinjau terpisah sebelum rilis production.
