# Panduan deploy GrowDu ke VPS

Panduan ini memakai **Ubuntu Server 24.04 LTS**, Node.js 22, MySQL dari repository
Ubuntu, Nginx, dan systemd pada satu VPS. Backend berjalan sebagai service;
frontend disajikan dari hasil build Vite. Semua perintah server memakai Bash.
Panduan memakai akun VPS `abillionaire` yang sudah dapat login SSH dan
menjalankan `sudo` untuk administrasi server.

Ini adalah petunjuk untuk dijalankan di VPS, bukan catatan deployment yang sudah
berhasil dilakukan. Jalankan langkah secara berurutan dan berhenti jika ada error.
Contoh instalasi ditujukan untuk VPS baru; jangan menimpa konfigurasi server yang
sudah melayani aplikasi lain.

## 1. Siapkan kebutuhan dan tentukan alamat

Sebagai titik awal untuk trafik kecil, gunakan 2 vCPU, RAM 4 GB, dan SSD 40 GB.
Ini perkiraan kapasitas awal, bukan hasil benchmark. Kebutuhan disk bertambah
mengikuti database, logo, bukti pembayaran, dan backup. Build dapat memerlukan
memori lebih besar daripada menjalankan aplikasi.

Siapkan akses SSH dengan key, akses sudo, domain, serta URL Git kedua aplikasi.
Ganti placeholder berikut di seluruh panduan:

| Contoh/placeholder                 | Ganti dengan                               |
| ---------------------------------- | ------------------------------------------ |
| `app.example.com`                  | Domain aplikasi                            |
| `IP_VPS`                           | IP publik VPS                              |
| `<URL_GIT_BACKEND>`                | URL repository backend                     |
| `<URL_GIT_FRONTEND>`               | URL repository frontend                    |
| `<BACKEND_REF>` / `<FRONTEND_REF>` | Tag atau commit yang akan dirilis          |
| `GANTI_...`                        | Password/secret unik dari password manager |

Di DNS, arahkan record **A** untuk `app.example.com` ke IPv4 VPS. Tambahkan AAAA
hanya jika IPv6 VPS sudah berfungsi. Jika memakai proxy CDN, mulai dengan DNS
langsung saat menyiapkan HTTPS agar alurnya mudah diperiksa.

Susunan URL yang dipakai:

| URL/path                    | Tujuan                                      |
| --------------------------- | ------------------------------------------- |
| `https://app.example.com/`  | Frontend React                              |
| `/admin`                    | Panel Super Admin **frontend**              |
| `/api/v1`                   | REST API NestJS                             |
| `/uploads/tenant-logos/...` | Logo publik melalui backend                 |
| `/backend-admin`            | AdminJS internal; ditutup dari akses publik |
| `/docs`                     | Swagger; dinonaktifkan di production        |

Alur request: browser → Nginx pada port 443 → file frontend atau backend pada
port 3000 → MySQL lokal pada port 3306. Hanya SSH, HTTP, dan HTTPS yang dibuka
ke internet. Model satu domain ini memakai origin yang sama untuk UI dan API.

**Batasan kode saat ini:** AdminJS masih memakai memory session store, dan
aplikasi belum mengatur `trust proxy`. Karena itu, panduan menutup AdminJS di
Nginx. Sebelum membuka panel tersebut, implementasikan session store persisten
dan konfigurasi proxy yang hanya mempercayai reverse proxy milik sendiri.
API juga belum membaca IP asli melalui proxy; batas request berbasis IP dapat
terbagi antar pengguna. Menambahkan header Nginx saja belum mengubah perilaku itu.
Panel frontend `/admin` memakai autentikasi API terpisah dan tetap dapat digunakan.

## 2. Gunakan akun abillionaire dan siapkan paket server

Akun `abillionaire` yang sudah memiliki akses sudo digunakan untuk mengelola
deployment. Tidak perlu membuat akun `deploy` atau mengatur ulang SSH untuk
akun baru. Akun service `growdu` tetap dibuat untuk menjalankan backend.

Jika belum terhubung, jalankan dari **terminal lokal Mac**, pada folder tempat
private key berada. Ganti `IP_VPS` dengan IP publik VPS:

```bash
chmod 600 abillionaire.pem
ssh -i abillionaire.pem abillionaire@IP_VPS
```

Private key tetap disimpan di komputer lokal. Jika sudah login melalui SSH
atau console penyedia VPS sebagai `abillionaire`, lanjutkan langsung ke langkah
berikutnya.

Jalankan perintah berikut **di sesi VPS** untuk memeriksa akun dan akses sudo:

```bash
whoami
sudo -v
```

Hasil `whoami` harus `abillionaire`. Jika sudo meminta password, masukkan password
akun VPS; karakter password memang tidak ditampilkan saat diketik.

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y nginx mysql-server git curl ca-certificates xz-utils \
  build-essential python3 rsync ufw openssl snapd
```

Buat akun service `growdu` satu kali, lalu tambahkan `abillionaire` ke grupnya.
Jika akun `growdu` sudah dibuat sebelumnya, lewati perintah `useradd`:

```bash
sudo useradd --system --user-group --home-dir /nonexistent \
  --shell /usr/sbin/nologin growdu
sudo usermod -aG growdu abillionaire
```

Keluar dari sesi VPS agar keanggotaan grup baru dapat diterapkan:

```bash
exit
```

Hubungkan kembali dari **terminal lokal**:

```bash
ssh -i abillionaire.pem abillionaire@IP_VPS
```

Jika memakai console penyedia, logout lalu login kembali sebagai `abillionaire`.
Setelah masuk kembali, jalankan **di VPS**:

```bash
id -nG
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
```

Pastikan `id -nG` menampilkan grup `growdu`. Jika SSH memakai port khusus,
izinkan port itu sebelum mengaktifkan UFW:

```bash
sudo ufw enable
sudo ufw status
```

Sesuaikan juga firewall di panel penyedia VPS: buka port SSH, 80, dan 443;
jangan buka 3000, 3306, atau port Vite. Kode backend saat ini mendengarkan
tanpa host bind khusus, sehingga pembatasan firewall untuk port 3000 diperlukan.

Uji login dari terminal lokal kedua sebelum menutup sesi VPS yang aktif:

```bash
ssh -i abillionaire.pem abillionaire@IP_VPS
```

Langkah selanjutnya dijalankan di VPS sebagai **abillionaire**. Gunakan `sudo`
pada perintah administratif yang dicontohkan; jalankan Git, npm, dan build
sebagai `abillionaire` tanpa sudo. Backend dijalankan systemd sebagai `growdu`.

## 3. Pasang Node.js 22

Backend menetapkan minimum `22.22.3`. Gunakan patch terbaru pada seri 22 dan
catat versi yang dipasang. Contoh ini mengunduh binary resmi dengan checksum;
direktori `/opt/growdu-node` juga dipakai oleh systemd.
[Sumber binary dan checksum Node.js](https://nodejs.org/download/release/latest-v22.x/).

```bash
mkdir -p /tmp/growdu-node-install
cd /tmp/growdu-node-install

case "$(uname -m)" in
  x86_64) GROWDU_NODE_ARCH=x64 ;;
  aarch64|arm64) GROWDU_NODE_ARCH=arm64 ;;
  *) printf 'Arsitektur VPS belum dicakup panduan ini.\n'; exit 1 ;;
esac

curl -fsSLo SHASUMS256.txt \
  https://nodejs.org/download/release/latest-v22.x/SHASUMS256.txt
GROWDU_NODE_FILE=$(awk -v suffix="-linux-${GROWDU_NODE_ARCH}.tar.xz" \
  'substr($2, length($2) - length(suffix) + 1) == suffix { print $2; exit }' \
  SHASUMS256.txt)
test -n "$GROWDU_NODE_FILE"
GROWDU_NODE_VERSION=${GROWDU_NODE_FILE%%-linux-*}
GROWDU_NODE_VERSION=${GROWDU_NODE_VERSION#node-}
curl -fSLO "https://nodejs.org/download/release/${GROWDU_NODE_VERSION}/${GROWDU_NODE_FILE}"
awk -v file="$GROWDU_NODE_FILE" '$2 == file' SHASUMS256.txt | sha256sum -c -
```

Lanjutkan hanya jika checksum menghasilkan `OK`:

```bash
sudo install -d -m 0755 /opt/growdu-node
sudo tar -xJf "$GROWDU_NODE_FILE" -C /opt/growdu-node --strip-components=1
printf '\nexport PATH="/opt/growdu-node/bin:$PATH"\n' >> ~/.profile
export PATH="/opt/growdu-node/bin:$PATH"
node --version
npm --version
```

Jangan mengekstrak versi baru di atas instalasi aktif saat memperbarui Node.
Siapkan direktori versi baru, hentikan service saat pergantian, lalu periksa
ulang dependency native seperti `argon2`.

## 4. Buat database dan akun MySQL

```bash
sudo systemctl enable --now mysql nginx
sudo mysql_secure_installation
sudo mysql
```

Pada prompt MySQL, gunakan password unik. Contoh berikut memisahkan akun runtime
dan migrasi sehingga aplikasi tidak mendapat hak mengubah schema:

```sql
CREATE DATABASE growdu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'growdu_app'@'127.0.0.1'
  IDENTIFIED BY 'GANTI_PASSWORD_DB_APP';
GRANT SELECT, INSERT, UPDATE, DELETE ON growdu.*
  TO 'growdu_app'@'127.0.0.1';

CREATE USER 'growdu_migrator'@'127.0.0.1'
  IDENTIFIED BY 'GANTI_PASSWORD_DB_MIGRATOR';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER
  ON growdu.* TO 'growdu_migrator'@'127.0.0.1';

SELECT @@GLOBAL.log_bin, @@GLOBAL.log_bin_trust_function_creators;
EXIT;
```

Migration `CreateMetricStatusHistory` membuat trigger. Jika binary log aktif
dan `log_bin_trust_function_creators=0`, administrator perlu mengizinkan pembuatan
trigger oleh akun migrasi tepercaya **selama proses migrasi pada langkah 8**.
Catat nilai sekarang; jangan mengubahnya dulu. Kembalikan nilai tersebut setelah
migrasi, termasuk jika migrasi gagal. Pengaturan ini berlaku global pada server MySQL. Pada server database
bersama, koordinasikan dengan DBA sebelum mengubahnya. Jangan memberikan
`SUPER` kepada akun aplikasi.
[Rujukan MySQL mengenai binary logging dan trigger](https://dev.mysql.com/doc/refman/8.0/en/stored-programs-logging.html).

Pertahankan akun migrator setelah deployment: trigger yang dibuat menyimpan
akun pembuat sebagai `DEFINER`, sehingga menghapus akun tersebut dapat
menggagalkan operasi terkait trigger.

Pastikan `bind-address = 127.0.0.1` pada konfigurasi server MySQL, umumnya di
`/etc/mysql/mysql.conf.d/mysqld.cnf`, lalu restart jika diubah:

```bash
sudo systemctl restart mysql
sudo ss -lntp
mysql -h 127.0.0.1 -u growdu_app -p growdu -e 'SELECT 1;'
```

Periksa listener MySQL/X Protocol juga tidak terbuka ke internet. Perintah
`mysql -p` meminta password secara interaktif; jangan menaruhnya dalam argumen CLI.
File `compose.yaml` yang ada di proyek hanya menyediakan MySQL untuk setup
lokal dan memiliki password fallback serta port host; jangan memakainya langsung
sebagai stack production.

## 5. Ambil source dan siapkan penyimpanan

Pada workspace saat panduan dibuat, backend dan frontend adalah **dua repository
Git terpisah**. Clone masing-masing tanpa membuat workspace npm atau repository
root baru. Kode yang akan dirilis harus sudah tersedia pada remote.

```bash
umask 0022
sudo install -d -o abillionaire -g growdu -m 2750 /srv/growdu
cd /srv/growdu
git clone '<URL_GIT_BACKEND>' growdu-backend
git clone '<URL_GIT_FRONTEND>' growdu-frontend

cd /srv/growdu/growdu-backend
git switch --detach '<BACKEND_REF>'
cd /srv/growdu/growdu-frontend
git switch --detach '<FRONTEND_REF>'
```

Untuk repository privat, gunakan deploy key dengan akses baca pada masing-masing
repository. Simpan private key di VPS; jangan memasukkan token ke URL clone.

```bash
sudo install -d -o root -g growdu -m 0750 /etc/growdu
sudo install -d -o growdu -g growdu -m 0750 \
  /srv/growdu-data /srv/growdu-data/uploads
sudo install -d -o growdu -g growdu -m 0700 \
  /srv/growdu-data/invoice-proofs /srv/growdu-data/payroll-proofs

cd /srv/growdu/growdu-backend
ln -s /srv/growdu-data/uploads uploads
sudo install -d -o growdu -g growdu -m 0700 .adminjs
```

`uploads/` pada working directory diperlukan oleh kode penyimpanan logo.
Folder `.adminjs` menyediakan lokasi tulis untuk cache/bundle AdminJS.
Pada clone baru, path tersebut seharusnya belum berisi data. Jika sudah ada
uploads, pindahkan datanya dengan verifikasi terlebih dahulu; jangan menghapusnya.
Bukti invoice dan payroll bersifat privat dan tidak boleh berada di `uploads/`
atau direktori web Nginx.

## 6. Isi environment production

```bash
cd /srv/growdu/growdu-backend
sudo install -o root -g growdu -m 0640 .env.example /etc/growdu/backend.env
ln -s /etc/growdu/backend.env .env
sudoedit /etc/growdu/backend.env
```

Ganti isi file dengan konfigurasi lengkap berikut. `GANTI_...` adalah placeholder,
bukan nilai yang boleh dipakai langsung. Generate secret berbeda dengan
`openssl rand -hex 32`; simpan hasilnya di password manager dan file environment.

```dotenv
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://app.example.com
API_PREFIX=api/v1
SWAGGER_ENABLED=false
SWAGGER_PATH=docs

ADMIN_ROOT_PATH=/backend-admin
ADMIN_EMAIL=internal-admin@example.com
ADMIN_PASSWORD=GANTI_PASSWORD_ADMINJS_YANG_KUAT
ADMIN_COOKIE_SECRET=GANTI_SECRET_ADMINJS_MINIMAL_32_KARAKTER

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=growdu_app
DB_PASSWORD=GANTI_PASSWORD_DB_APP
DB_NAME=growdu
DB_LOGGING=false
DB_POOL_SIZE=10

JWT_ACCESS_SECRET=GANTI_SECRET_JWT_MINIMAL_32_KARAKTER
JWT_ISSUER=growdu-backend
JWT_AUDIENCE=growdu-web
JWT_ACCESS_TTL_SECONDS=900
AUTH_REFRESH_TTL_DAYS=7
AUTH_COOKIE_NAME=growdu_refresh_token
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_SECURE=true
FRONTEND_ORIGINS=https://app.example.com

INVOICE_AUTOMATION_ENABLED=true
INVOICE_PROOF_STORAGE_PATH=/srv/growdu-data/invoice-proofs
PAYROLL_AUTOMATION_ENABLED=true
PAYROLL_PROOF_STORAGE_PATH=/srv/growdu-data/payroll-proofs
```

Jangan menyisakan nilai kosong dari `.env.example` untuk field wajib/default yang
tidak menerima string kosong. Kutip nilai password jika mengandung `#` atau spasi.
`PUBLIC_BASE_URL` harus domain publik tanpa `/api/v1`; nilai ini membentuk URL
logo. `FRONTEND_ORIGINS` harus origin persis, termasuk `https://`, tanpa path atau
slash penutup. Jika menambah domain UI lain, tambahkan origin itu dengan koma.

AdminJS tetap memerlukan konfigurasi wajib meskipun akses publiknya diblokir.
Akun AdminJS, OWNER, dan platform admin adalah tiga jenis akun berbeda.

Environment frontend:

```bash
cd /srv/growdu/growdu-frontend
nano .env.production.local
```

```dotenv
VITE_API_BASE_URL=https://app.example.com/api/v1
```

Nilai `VITE_*` masuk ke bundle saat build dan dapat dibaca pengguna. Setelah
mengubahnya, build dan publikasikan frontend kembali. Jangan menyimpan password
database, JWT secret, atau credential lain di frontend.
[Rujukan environment Vite](https://vite.dev/guide/env-and-mode.html).

## 7. Install, periksa, dan build

Backend:

```bash
cd /srv/growdu/growdu-backend
umask 0022
npm ci --include=dev
npm run lint
npm run test
npm run build
test -f dist/main.js
test -f dist/database/data-source.js
sudo -u growdu test -r dist/main.js
sudo -u growdu test -r .env
```

Frontend:

```bash
cd /srv/growdu/growdu-frontend
npm ci --include=dev
npm run typecheck
npm run lint
npm run build
test -f dist/index.html
```

Build membutuhkan devDependencies walaupun targetnya production; karena itu
gunakan `--include=dev`. Jalankan npm sebagai `abillionaire`, tanpa sudo. Jangan
memakai `npm run dev` atau `vite preview` sebagai service production; Nginx akan
menyajikan `dist/`.
[Rujukan deploy static Vite](https://vite.dev/guide/static-deploy.html).

Jika menjalankan E2E, lakukan di lokal/CI/staging dengan database dan credential
pengujian terpisah. Suite E2E membutuhkan hak membuat/menghapus database
disposable; jangan memberikannya pada akun production untuk menjalankan test.

## 8. Jalankan migrasi dan buat akun awal

Untuk database kosong, jalankan migrasi terkompilasi dengan akun migrator.
Untuk database yang sudah berisi data, buat backup sebelum langkah ini.

Jika binary log aktif dan nilai `log_bin_trust_function_creators` sebelumnya 0,
ubah sementara tepat sebelum menjalankan migrasi:

```bash
sudo mysql -e "SET GLOBAL log_bin_trust_function_creators = 1;"
```

```bash
cd /srv/growdu/growdu-backend
read -r -s -p 'Password MySQL migrator: ' GROWDU_MIGRATOR_PASSWORD
printf '\n'
DB_USERNAME=growdu_migrator DB_PASSWORD="$GROWDU_MIGRATOR_PASSWORD" \
  npm run typeorm:prod -- migration:show
DB_USERNAME=growdu_migrator DB_PASSWORD="$GROWDU_MIGRATOR_PASSWORD" \
  npm run migration:run:prod
DB_USERNAME=growdu_migrator DB_PASSWORD="$GROWDU_MIGRATOR_PASSWORD" \
  npm run typeorm:prod -- migration:show
unset GROWDU_MIGRATOR_PASSWORD
```

Pastikan seluruh migration ditandai sudah dijalankan. Jangan menambahkan
`synchronize=true`. DDL MySQL dapat melakukan implicit commit; migrasi gagal
bisa meninggalkan perubahan parsial. Jika gagal, periksa schema dan tabel
`migrations` sebelum mencoba lagi, terutama jika ada error “table already exists”.

Jika sebelumnya mengubah `log_bin_trust_function_creators` dari 0 menjadi 1,
kembalikan setelah proses selesai:

```bash
sudo mysql -e "SET GLOBAL log_bin_trust_function_creators = 0;"
```

Untuk membuat tenant dan OWNER pertama, tambahkan sementara ke backend.env:

```dotenv
PROVISION_TENANT_NAME=Bimbel Saya
PROVISION_OWNER_NAME=Nama Pemilik
PROVISION_OWNER_PHONE_NUMBER=081234567890
PROVISION_OWNER_EMAIL=owner@example.com
PROVISION_OWNER_PASSWORD=GANTI_PASSWORD_OWNER_MINIMAL_12_KARAKTER
```

```bash
cd /srv/growdu/growdu-backend
node dist/commands/provision-owner.js
```

Untuk panel Super Admin frontend `/admin`, tambahkan sementara:

```dotenv
PLATFORM_ADMIN_EMAIL=superadmin@example.com
PLATFORM_ADMIN_PASSWORD=GANTI_PASSWORD_SUPERADMIN_YANG_KUAT
```

```bash
node dist/commands/provision-platform-admin.js
```

Kedua command memakai file `.env` di working directory. Hapus kembali seluruh
`PROVISION_*` dan `PLATFORM_ADMIN_*` dari backend.env setelah berhasil. Provisioning
bukan langkah rutin deploy ulang; email yang sudah terdaftar akan ditolak.

## 9. Jalankan backend dengan systemd

```bash
sudoedit /etc/systemd/system/growdu-api.service
```

```ini
[Unit]
Description=GrowDu NestJS API
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=growdu
Group=growdu
WorkingDirectory=/srv/growdu/growdu-backend
Environment=NODE_ENV=production
Environment=PATH=/opt/growdu-node/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/opt/growdu-node/bin/node dist/main.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

NestJS membaca `.env` melalui symlink yang dibuat sebelumnya; unit ini sengaja
tidak memuat file yang sama sebagai `EnvironmentFile` kedua kali. Working
directory menentukan lokasi `.env`, uploads, dan sejumlah path relatif.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now growdu-api
sudo systemctl status growdu-api --no-pager
sudo journalctl -u growdu-api -n 100 --no-pager
curl --fail-with-body http://127.0.0.1:3000/api/v1
```

Respons yang diharapkan:

```json
{ "service": "growdu-backend", "status": "ok" }
```

Endpoint ini memeriksa respons proses HTTP; ia bukan pemeriksaan kesehatan
database secara menyeluruh. Verifikasi fitur database juga pada langkah 12.
Gunakan satu instance backend untuk setup ini, termasuk proses automation
invoice/payroll. Jangan menyalakan instance tambahan tanpa meninjau koordinasi
job terjadwal.
[Rujukan service systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).

## 10. Publikasikan frontend dan pasang Nginx

```bash
sudo install -d -o abillionaire -g "$(id -gn abillionaire)" -m 0755 \
  /var/www/growdu /var/www/growdu/assets
cd /srv/growdu/growdu-frontend
rsync -a --chmod=D755,F644 dist/assets/ /var/www/growdu/assets/
rsync -a --chmod=D755,F644 --exclude='/assets/' dist/ /var/www/growdu/
sudoedit /etc/nginx/snippets/growdu-api.conf
```

Isi snippet proxy:

```nginx
proxy_pass http://127.0.0.1:3000;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Connection "";
proxy_connect_timeout 5s;
proxy_read_timeout 60s;
```

`proxy_pass` tidak memakai slash sesudah `3000`, supaya prefix `/api/v1` tetap
diteruskan. Header di atas mengasumsikan Nginx menerima trafik langsung dari
browser; konfigurasi IP perlu ditinjau lagi jika menambahkan CDN/proxy lain.
[Rujukan proxy_pass Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass).

```bash
sudoedit /etc/nginx/sites-available/growdu
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;

    root /var/www/growdu;
    index index.html;
    server_tokens off;
    client_max_body_size 8m;

    location ^~ /api/ {
        include /etc/nginx/snippets/growdu-api.conf;
    }

    location ^~ /uploads/ {
        include /etc/nginx/snippets/growdu-api.conf;
    }

    location ^~ /backend-admin { return 404; }
    location ^~ /docs { return 404; }
    location ^~ /storage/ { return 404; }

    location ~ /\.(?!well-known/) { deny all; }

    location ^~ /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Fallback `index.html` diperlukan untuk refresh route React seperti `/dashboard`
dan `/admin`. Jangan membuat proxy `/admin` ke AdminJS. Batas body Nginx 8 MB
memberi ruang untuk upload bukti maksimal 5 MB beserta multipart overhead;
validasi ukuran di backend tetap berlaku.
[Rujukan try_files Nginx](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files).

```bash
sudo ln -s /etc/nginx/sites-available/growdu /etc/nginx/sites-enabled/growdu
sudo nginx -t
sudo systemctl reload nginx
curl -I http://app.example.com
```

Lanjutkan ke HTTPS sebelum login. Pada production cookie refresh memakai
`Secure`, sehingga pengujian autentikasi lewat HTTP tidak mewakili setup akhir.

## 11. Aktifkan HTTPS

Pastikan DNS sudah mengarah ke VPS dan port 80/443 dapat diakses. Pada VPS baru
ini, gunakan Certbot dari snap:

```bash
sudo snap install --classic certbot
sudo /snap/bin/certbot --nginx -d app.example.com --redirect
sudo nginx -t
sudo /snap/bin/certbot renew --dry-run
```

Isi email operasional ketika diminta. Certbot memasang sertifikat, konfigurasi
HTTPS, redirect HTTP, serta penjadwalan renewal. Jika sudah ada Certbot dari
package manager lain, ikuti petunjuk migrasi instalasi resminya terlebih dahulu.
[Petunjuk resmi Certbot untuk Nginx](https://certbot.eff.org/instructions?ws=nginx&os=snap).

```bash
curl --fail-with-body https://app.example.com/api/v1
curl -I https://app.example.com/dashboard
curl -I https://app.example.com/admin
curl -I https://app.example.com/backend-admin
curl -I https://app.example.com/docs
```

Target: API `200` dengan JSON status, route frontend `200` dengan HTML,
serta AdminJS dan Swagger `404`. HTTP biasa harus redirect ke HTTPS.

## 12. Verifikasi sebelum digunakan

- Login OWNER, pilih bimbel, lalu baca dan ubah satu data percobaan.
- Refresh halaman serta buka route secara langsung untuk memeriksa fallback SPA.
- Login panel `/admin` memakai akun platform admin, bukan credential AdminJS.
- Di browser, pastikan request API menuju domain HTTPS dan tidak ke localhost.
- Pastikan cookie refresh `HttpOnly` dan `Secure`; uji refresh session/logout.
- Upload logo dan periksa URL hasilnya memakai domain publik.
- Upload bukti pembayaran invoice/payroll, buka melalui endpoint berotorisasi,
  dan pastikan pengguna tanpa izin tidak dapat membacanya.
- Unduh invoice/slip PDF untuk memeriksa dependency dan font runtime.
- Restart `growdu-api`, lalu periksa data dan file upload tetap tersedia.
- Periksa log automation invoice/payroll serta jadwal tenant sesuai WIB.
- Periksa dari luar VPS bahwa port 3000 dan 3306 tidak dapat diakses.

```bash
sudo systemctl restart growdu-api
sudo journalctl -u growdu-api -n 100 --no-pager
sudo ufw status
```

## 13. Backup data, file, dan konfigurasi

Cadangkan database **beserta trigger**, `/srv/growdu-data`, konfigurasi environment,
dan referensi versi kedua aplikasi. Backup SQL saja tidak memuat logo/bukti bayar.
Contoh ini menghentikan backend sebentar untuk menjaga konsistensi SQL dan file;
jadwalkan maintenance dan pastikan tidak ada writer lain ke database.

```bash
sudo systemctl stop growdu-api
sudo bash <<'GROWDU_BACKUP'
set -euo pipefail
umask 077
GROWDU_BACKUP_DIR="/var/backups/growdu/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$GROWDU_BACKUP_DIR"
mysqldump --single-transaction --routines --triggers --events \
  --no-tablespaces --set-gtid-purged=OFF growdu \
  | gzip > "$GROWDU_BACKUP_DIR/database.sql.gz"
tar -czf "$GROWDU_BACKUP_DIR/data.tar.gz" -C /srv growdu-data
tar -czf "$GROWDU_BACKUP_DIR/config.tar.gz" -C / \
  etc/growdu etc/letsencrypt etc/nginx/sites-available/growdu \
  etc/nginx/snippets/growdu-api.conf etc/systemd/system/growdu-api.service
sudo -u abillionaire git -C /srv/growdu/growdu-backend rev-parse HEAD \
  > "$GROWDU_BACKUP_DIR/backend-ref.txt"
sudo -u abillionaire git -C /srv/growdu/growdu-frontend rev-parse HEAD \
  > "$GROWDU_BACKUP_DIR/frontend-ref.txt"
/opt/growdu-node/bin/node --version > "$GROWDU_BACKUP_DIR/node-version.txt"
gzip -t "$GROWDU_BACKUP_DIR/database.sql.gz"
tar -tzf "$GROWDU_BACKUP_DIR/data.tar.gz" > /dev/null
printf 'Backup tersimpan di %s\n' "$GROWDU_BACKUP_DIR"
GROWDU_BACKUP
```

Pada instalasi Ubuntu standar, `mysqldump` di atas memakai autentikasi socket
root lokal. Jika konfigurasi autentikasi sudah berbeda, sesuaikan metode backup
dengan DBA tanpa menaruh password di command line.

Sesudah backup berhasil dan jika tidak langsung melakukan deploy ulang:

```bash
sudo systemctl start growdu-api
curl --fail-with-body http://127.0.0.1:3000/api/v1
```

Arsip konfigurasi mengandung secret dan private key TLS; arsip data mengandung dokumen privat.
Enkripsi lalu salin ke penyimpanan di luar VPS dengan akses terbatas. Jadwalkan
backup harian serta sebelum migrasi; contoh di atas masih dijalankan manual.
Tentukan retensi sesuai kebutuhan dan uji restore pada server/database terpisah.

Saat restore, buat kembali akun MySQL dan grant-nya, termasuk akun migrator yang
menjadi `DEFINER` trigger. Pulihkan SQL, data, ownership file, konfigurasi, dan
versi aplikasi yang cocok. Uji pembacaan serta perubahan siswa/tentor agar
trigger ikut teruji. Jangan menimpa database production sebagai latihan restore.

## 14. Deploy versi berikutnya dan rollback

Alur ini memiliki downtime selama install, build, dan migrasi karena backend
dihentikan di direktori aktif. Untuk deploy tanpa downtime diperlukan rancangan release terpisah dan
kompatibilitas schema antarversi; itu di luar setup satu instance ini.

1. Uji kedua versi di lokal/CI/staging. Tinjau migration dan kompatibilitas API.
2. Catat ref aktif, buat backup sesuai langkah 13, dan biarkan backend berhenti.
   Jangan lanjut sebelum backup berhasil.
3. Checkout ref baru dan build backend:

   ```bash
   cd /srv/growdu/growdu-backend
   umask 0022
   git status --short
   git fetch origin --tags
   git switch --detach '<BACKEND_REF>'
   npm ci --include=dev
   npm run lint
   npm run test
   npm run build
   sudo -u growdu test -r dist/main.js
   ```

4. Terapkan perubahan environment yang dibutuhkan versi baru, kemudian jalankan
   migrasi seperti langkah 8 dengan akun migrator. Kembalikan pengaturan global
   MySQL jika sempat diubah. Untuk memeriksa status gunakan
   `npm run typeorm:prod -- migration:show`; ini tidak memerlukan ts-node.
5. Build frontend:

   ```bash
   cd /srv/growdu/growdu-frontend
   git status --short
   git fetch origin --tags
   git switch --detach '<FRONTEND_REF>'
   npm ci --include=dev
   npm run typecheck
   npm run lint
   npm run build
   ```

6. Jalankan backend baru dan pastikan API sehat sebelum mempublikasikan UI baru:

   ```bash
   sudo systemctl start growdu-api
   curl --fail-with-body http://127.0.0.1:3000/api/v1
   sudo journalctl -u growdu-api -n 100 --no-pager
   ```

7. Publikasikan aset lebih dahulu, lalu HTML:

   ```bash
   cd /srv/growdu/growdu-frontend
   rsync -a --chmod=D755,F644 dist/assets/ /var/www/growdu/assets/
   rsync -a --chmod=D755,F644 --exclude='/assets/' dist/ /var/www/growdu/
   ```

8. Ulangi verifikasi langkah 12. Catat kedua commit dan waktu rilis.

Jangan lanjut saat `git status` menunjukkan perubahan source yang belum
dipahami. File `.env`, storage, dan upload tetap berada di luar source yang
diganti. Publikasi di atas mempertahankan aset lama agar tab browser yang masih
memakai HTML versi sebelumnya tetap dapat memuatnya. Bersihkan aset lama setelah
masa retensi yang ditentukan, bukan saat publikasi versi baru.

Jika versi baru gagal dan **schema masih kompatibel dengan versi lama**:

```bash
sudo systemctl stop growdu-api
cd /srv/growdu/growdu-backend
umask 0022
git switch --detach '<BACKEND_REF_SEBELUMNYA>'
npm ci --include=dev
npm run build
sudo -u growdu test -r dist/main.js
```

Pulihkan perubahan environment yang tidak kompatibel, mulai backend, dan periksa
API. Untuk frontend, checkout ref sebelumnya, jalankan `npm ci --include=dev`
serta `npm run build`, lalu publikasikan memakai kedua perintah rsync tadi.
Rollback ini membutuhkan dependency registry yang tersedia dan waktu build.

Jangan menjalankan `migration:revert` secara otomatis di production. Beberapa
migration menghapus kolom, tabel, atau histori saat turun. Jika schema tidak
kompatibel, tentukan migration koreksi atau pemulihan backup yang sudah diuji;
restore backup menghilangkan perubahan data setelah waktu backup dan memerlukan
persetujuan atas dampaknya.

## 15. Troubleshooting

| Gejala                         | Pemeriksaan                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Nginx `502`                    | Periksa `systemctl status growdu-api`, journal, dan curl port 3000 lokal.                                                         |
| Startup gagal validasi         | Periksa nilai wajib, panjang secret, nilai kosong, dan `.env` pada working directory.                                             |
| `EACCES`                       | Pastikan user `growdu` bisa membaca source/.env dan menulis `.adminjs`, uploads, serta proof storage. Jangan memakai `chmod 777`. |
| API berisi HTML                | Periksa location `/api/` dan pastikan base URL frontend berakhir `/api/v1`.                                                       |
| Refresh route `404`            | Periksa fallback `try_files ... /index.html`.                                                                                     |
| Login/refresh gagal            | Periksa HTTPS, origin persis, cookie, dan URL API dalam bundle; build ulang jika env frontend berubah.                            |
| Respons `429` antar pengguna   | Backend belum mempercayai proxy sehingga tracker IP bisa memakai IP Nginx; tinjau konfigurasi proxy di kode.                      |
| Logo menuju localhost          | Perbaiki `PUBLIC_BASE_URL`; URL logo lama tersimpan di database sehingga perlu upload/update logo kembali.                        |
| Upload `413`                   | Periksa `client_max_body_size`; batas file backend tetap berlaku.                                                                 |
| Bukti bayar hilang             | Periksa path absolut, permission, isi backup, serta metadata database yang cocok.                                                 |
| Migration error privilege/1419 | Periksa grant `TRIGGER`, binary log, dan pengaturan sementara pada langkah 4.                                                     |
| Trigger error `DEFINER`        | Pastikan akun migrator pembuat trigger masih ada beserta privilege yang dibutuhkan.                                               |
| Certbot gagal                  | Periksa DNS A/AAAA, firewall penyedia, port 80, dan konfigurasi Nginx.                                                            |
| Proses mati saat build         | Periksa RAM/OOM; build di CI atau tambah kapasitas sesuai pengukuran.                                                             |

```bash
sudo journalctl -u growdu-api -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
sudo systemctl status mysql --no-pager
df -h
free -h
```

Samarkan credential, token, cookie, dan data pribadi sebelum membagikan log.
