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
   npm run start:dev
   ```

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

## Quality checks

```bash
npm run lint
npm run test
npm run build
```
