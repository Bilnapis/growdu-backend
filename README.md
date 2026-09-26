# Growdu Backend

Backend Growdu menggunakan NestJS, TypeORM, dan MySQL/MariaDB dari XAMPP.

## Prasyarat

- Node.js `>= 22.22.3`
- npm
- XAMPP dengan module MySQL aktif

## Menjalankan secara lokal

1. Salin konfigurasi environment:

   ```bash
   cp .env.example .env
   ```

   Di PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Buka XAMPP Control Panel lalu jalankan module **MySQL**.

3. Buat database `growdu` melalui phpMyAdmin, atau jalankan:

   ```powershell
   C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS growdu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```

4. Install dependency dan jalankan aplikasi:

   ```bash
   npm install
   npm run migration:run
   npm run provision:owner
   npm run start:dev
   ```

   `provision:owner` membuat tenant awal dan akun OWNER secara atomik. Isi
   `PROVISION_TENANT_NAME`, `PROVISION_OWNER_EMAIL`, dan
   `PROVISION_OWNER_PASSWORD` hanya ketika menjalankan command tersebut. Command
   akan berhenti jika email OWNER sudah terdaftar.

API tersedia di `http://localhost:3000/api/v1`.

Admin Panel tersedia di `http://localhost:3000/admin`. Masuk menggunakan
`ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari `.env`.

Dokumentasi Swagger tersedia di `http://localhost:3000/docs`. Swagger
menampilkan seluruh endpoint dan menyediakan fitur **Try it out** untuk menguji
request langsung dari browser.

## Konfigurasi environment

| Variable | Deskripsi | Default |
| --- | --- | --- |
| `NODE_ENV` | Environment aplikasi | `development` |
| `PORT` | Port HTTP | `3000` |
| `API_PREFIX` | Prefix seluruh endpoint | `api/v1` |
| `SWAGGER_ENABLED` | Aktifkan dashboard Swagger | `true` |
| `SWAGGER_PATH` | Path dokumentasi Swagger | `docs` |
| `ADMIN_ROOT_PATH` | Path AdminJS | `/admin` |
| `ADMIN_EMAIL` | Email untuk login AdminJS | wajib |
| `ADMIN_PASSWORD` | Password AdminJS, minimal 12 karakter | wajib |
| `ADMIN_COOKIE_SECRET` | Secret session AdminJS, minimal 32 karakter | wajib |
| `DB_HOST` | Host MySQL XAMPP | `127.0.0.1` |
| `DB_PORT` | Port MySQL | `3306` |
| `DB_USERNAME` | User MySQL XAMPP | `root` |
| `DB_PASSWORD` | Password MySQL; kosong untuk default XAMPP | kosong |
| `DB_NAME` | Nama database | `growdu` |
| `DB_LOGGING` | Tampilkan query SQL | `false` |
| `DB_POOL_SIZE` | Maksimum koneksi pool | `10` |
| `JWT_ACCESS_SECRET` | Secret penandatangan access token, minimal 32 karakter | wajib |
| `JWT_ISSUER` | JWT issuer yang diterima API | `growdu-backend` |
| `JWT_AUDIENCE` | JWT audience yang diterima API | `growdu-web` |
| `JWT_ACCESS_TTL_SECONDS` | Masa berlaku access token dalam detik | `900` |
| `AUTH_REFRESH_TTL_DAYS` | Masa berlaku refresh session dalam hari | `7` |
| `AUTH_COOKIE_NAME` | Nama cookie refresh token | `growdu_refresh_token` |
| `AUTH_COOKIE_SAME_SITE` | Policy cookie: `lax`, `strict`, atau `none` | `lax` |
| `AUTH_COOKIE_SECURE` | Kirim cookie hanya melalui HTTPS | `false` (`true` di production) |
| `FRONTEND_ORIGINS` | Allowlist origin CORS, dipisahkan koma | `http://localhost:5173` |
| `PROVISION_TENANT_NAME` | Nama tenant untuk command provisioning | hanya command |
| `PROVISION_OWNER_EMAIL` | Email OWNER untuk command provisioning | hanya command |
| `PROVISION_OWNER_PASSWORD` | Password OWNER 12–128 karakter | hanya command |

Aplikasi akan berhenti saat startup jika konfigurasi wajib tidak valid.

Untuk production, atur `SWAGGER_ENABLED=false` jika dokumentasi API tidak boleh
diakses publik. Ganti seluruh kredensial AdminJS dan gunakan session store
persisten seperti Redis; konfigurasi bawaan menggunakan memory store yang hanya
sesuai untuk development satu instance.

Konfigurasi tersebut menggunakan kredensial default XAMPP. Jika user `root`
memiliki password, isi `DB_PASSWORD` di `.env`. Jangan gunakan user `root`
tanpa password untuk production.

## Alternatif Docker

File `compose.yaml` tetap tersedia sebagai alternatif. Container memakai port
host `3307` agar tidak bentrok dengan XAMPP pada `3306`. Jika menggunakan
Docker, sesuaikan `DB_PORT`, `DB_USERNAME`, dan `DB_PASSWORD` pada `.env`.

## Migrasi database

Schema database tidak dibuat otomatis (`synchronize` selalu `false`). Gunakan migrasi TypeORM agar setiap perubahan schema dapat ditinjau dan di-rollback.

```bash
# buat migrasi kosong
npm run migration:create -- src/database/migrations/CreateUsers

# generate migrasi dari perubahan entity
npm run migration:generate -- src/database/migrations/InitialSchema

# lihat status migrasi
npm run migration:show

# jalankan / rollback migrasi
npm run migration:run
npm run migration:revert
```

Untuk deployment, build lebih dahulu lalu jalankan `npm run migration:run:prod`.

Migration tidak dijalankan otomatis saat aplikasi dimulai. Untuk memverifikasi
reversibilitas, gunakan command berikut. Command membuat database disposable
dengan nama acak, menjalankan `run → revert → run`, lalu menghapus database itu:

```bash
npm run migration:verify
```

## Autentikasi dan akses API

Endpoint aplikasi menggunakan access JWT pada header
`Authorization: Bearer <token>`. Login juga mengirim refresh token melalui
cookie `HttpOnly` dengan path `/api/v1/auth`. Client browser harus mengaktifkan
credentials untuk request login, refresh, dan logout.

- `POST /api/v1/auth/login` menerima email dan password.
- `POST /api/v1/auth/refresh` merotasi refresh token.
- `POST /api/v1/auth/logout` mencabut session saat ini.
- `POST /api/v1/auth/logout-all` mencabut semua session user.
- `GET /api/v1/auth/me` mengembalikan principal aktif.
- `PATCH /api/v1/auth/password` mengganti password dan mencabut semua session.

OWNER mengelola akun; OWNER dan ADMIN mengelola data tutor, parent, student,
serta relasi parent–student. TUTOR hanya membaca profilnya sendiri. PARENT hanya
membaca profil dan student dengan relasi akses aktif. Endpoint billing belum
tersedia sampai domain invoice diimplementasikan.

Semua query domain menggunakan tenant dari JWT. `tenantId` dari payload client
tidak diterima, dan data tenant lain diperlakukan sebagai tidak ditemukan.

## Quality checks

```bash
npm run lint
npm run test
npm run test:e2e
npm run build
npm run migration:show
```

`test:e2e` memerlukan MySQL dan hak untuk membuat/menghapus database. Test
membuat database disposable berawalan `growdu_e2e_`, menjalankan migration dan
skenario API, lalu menghapusnya pada teardown. Database pada `DB_NAME` tidak
diubah oleh suite E2E.
