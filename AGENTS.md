# AGENTS.md — GrowDu Backend

Panduan ini berlaku untuk seluruh perubahan di `growdu-backend/`. Baca juga
`../AGENTS.md`; bila ada aturan yang lebih spesifik di file ini, aturan file ini
yang berlaku untuk backend. Requirement pekerjaan aktif dan keamanan data tetap
menjadi prioritas utama.

## 1. Tanggung Jawab Backend

Backend GrowDu bertanggung jawab atas:

- REST API dan kontrak Swagger/OpenAPI.
- Business rule, autentikasi, otorisasi, dan validasi input.
- Persistence melalui TypeORM dan MySQL.
- Migrasi dan integritas schema database.
- AdminJS sebagai panel operasional internal.
- Integrasi server-side dengan layanan eksternal.

Frontend dan AdminJS adalah consumer dari business rule yang sama. Jangan
membuat rule penting hanya di UI atau hanya di konfigurasi AdminJS.

## 2. Stack dan Konvensi Runtime

- Node.js `>= 22.22.3`.
- NestJS, TypeScript strict, dan ECMAScript modules.
- TypeScript memakai `module` serta `moduleResolution` bernilai `nodenext`.
- Relative import source wajib memakai suffix `.js`, contohnya:

  ```ts
  import { UsersService } from './users.service.js';
  ```

- TypeORM dengan driver `mysql2`.
- AdminJS terintegrasi melalui `@adminjs/nestjs`.
- Vitest untuk unit dan E2E test.
- Oxlint untuk linting dan Prettier untuk formatting.
- Gunakan single quote dan trailing comma sesuai `.prettierrc`.

Jangan mengubah module system, target TypeScript, ORM, database engine, atau test
runner sebagai bagian dari fitur yang tidak berkaitan.

## 3. Struktur Source

Struktur lintas aplikasi yang sudah tersedia:

```text
src/
├── admin/       # Integrasi dan resource AdminJS
├── config/      # Typed config dan validasi environment
├── database/    # Data source serta migrations
├── app.module.ts
├── app.setup.ts # Global pipes, prefix, dan Swagger
└── main.ts      # Bootstrap aplikasi
```

Tambahkan domain baru sebagai feature module:

```text
src/<feature>/
├── dto/
│   ├── create-<feature>.dto.ts
│   ├── update-<feature>.dto.ts
│   └── <feature>-response.dto.ts
├── entities/
│   └── <feature>.entity.ts
├── repositories/              # Hanya jika abstraksi memberi nilai nyata
├── <feature>.controller.ts
├── <feature>.service.ts
├── <feature>.module.ts
└── <feature>.service.spec.ts
```

- Kelompokkan kode berdasarkan domain, bukan membuat folder global berisi semua
  controller, service, atau entity.
- Satu module harus mempunyai boundary yang jelas dan API publik seminimal
  mungkin.
- Provider hanya diekspor jika benar-benar dipakai module lain.
- Hindari circular dependency. Jangan memakai `forwardRef` sebelum memperbaiki
  boundary module dan dependency direction.
- Hindari file utilitas generik yang menjadi tempat berbagai business rule yang
  tidak berhubungan.

## 4. Controller, Service, dan Dependency Injection

### Controller

- Controller menangani transport HTTP: route, parameter, DTO, status code,
  Swagger metadata, dan delegasi ke service.
- Jangan menaruh query TypeORM, transaksi, atau business rule di controller.
- Gunakan route berbentuk resource dan kata benda. Ikuti prefix global yang
  dikonfigurasi melalui `API_PREFIX`.
- Gunakan HTTP status code yang sesuai dan konsisten.
- Jangan mengembalikan entity mentah bila field internal atau sensitif dapat ikut
  terekspos. Gunakan response DTO atau serializer.

### Service

- Service mengimplementasikan use case dan business rule.
- Setiap method harus memiliki satu tujuan yang jelas dan nama berbasis aksi.
- Pecah service besar berdasarkan capability, bukan sekadar jumlah baris.
- Lempar NestJS exception yang tepat pada boundary aplikasi. Jangan menelan error
  atau mengganti seluruh error menjadi status `500` tanpa konteks.
- Untuk operasi independen gunakan concurrency secara sadar; operasi yang saling
  bergantung atau berada dalam satu transaksi harus mempertahankan urutannya.

### Dependency Injection

- Gunakan constructor injection.
- Jangan membuat instance service/repository dengan `new` di consumer.
- Gunakan injection token untuk dependency berbasis interface atau implementasi
  yang dapat diganti.
- Pertahankan default singleton scope. Gunakan request/transient scope hanya bila
  kebutuhan lifecycle-nya jelas karena ada biaya performa.

## 5. DTO, Validation, dan API Contract

Global `ValidationPipe` sudah menggunakan:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`
- implicit conversion

Oleh karena itu:

- Semua input body, query, dan param harus direpresentasikan oleh DTO yang jelas.
- Tambahkan decorator `class-validator` untuk setiap constraint yang berlaku.
- Jangan memakai entity sebagai request DTO.
- Bedakan DTO create, update, filter/query, dan response ketika kontraknya
  berbeda.
- Validasi format di DTO, tetapi validasi business rule dan akses data di service.
- Perbarui decorator Swagger ketika endpoint, request, response, auth, atau status
  code berubah.
- Pertahankan backward compatibility. Breaking change membutuhkan versi API dan
  koordinasi dengan `growdu-frontend/`.
- Jangan mengekspos stack trace, SQL error, secret, hash, token, atau detail
  implementasi melalui response.

## 6. Database dan TypeORM

- MySQL adalah source of truth untuk data persisten.
- `synchronize` dan `migrationsRun` harus tetap `false` pada konfigurasi aplikasi.
- Setiap perubahan schema wajib memiliki migration di
  `src/database/migrations/`.
- Migration yang sudah pernah dijalankan di environment bersama bersifat
  immutable. Buat migration baru untuk koreksi.
- Pastikan migration mempunyai jalur `up` dan `down` yang masuk akal. Jelaskan
  bila rollback aman tidak mungkin dilakukan.
- Gunakan transaksi untuk beberapa write yang harus atomic.
- Validasi keberadaan record serta ownership sebelum update/delete.
- Pilih kolom yang dibutuhkan, batasi jumlah hasil, dan gunakan pagination untuk
  collection yang dapat membesar.
- Hindari N+1 query. Gunakan relation loading, join, atau batch query secara
  terukur.
- Tambahkan unique constraint, foreign key, dan index untuk menegakkan integritas
  serta mendukung pola query nyata.
- Jangan mengandalkan validasi aplikasi saja untuk invariant yang dapat ditegakkan
  database.
- Jangan menyimpan password atau token mentah. Jangan menulis data sensitif ke
  log.

Perintah migration dijalankan dari `growdu-backend/`:

```bash
npm run migration:create -- src/database/migrations/NamaMigration
npm run migration:generate -- src/database/migrations/NamaMigration
npm run migration:show
npm run migration:run
npm run migration:revert
```

Periksa generated migration sebelum menjalankannya. Jangan menerima drop table,
drop column, atau perubahan tipe destruktif tanpa verifikasi dan persetujuan.

## 7. AdminJS

- AdminJS adalah panel internal, bukan security boundary tunggal.
- Resource dan custom action harus tetap tunduk pada autentikasi, otorisasi, serta
  business rule backend.
- Gunakan service/use case domain untuk custom action yang mengubah state. Jangan
  menyalin query dan rule ke handler AdminJS.
- Sembunyikan field sensitif dari list, show, edit, filter, dan export.
- Batasi action berdasarkan role dan permission; menyembunyikan tombol saja tidak
  cukup jika action masih dapat dipanggil.
- Perubahan berisiko seperti delete, suspend, refund, atau bulk update harus
  memiliki konfirmasi dan audit trail yang proporsional.
- Konfigurasi AdminJS dan session berasal dari typed config/environment.
- Memory session store hanya untuk development satu instance. Production wajib
  memakai persistent store dan secure cookie.

## 8. Configuration dan Security

- Daftarkan typed configuration di `src/config/`.
- Tambahkan variable baru ke schema validasi dan `.env.example`.
- Jangan membaca `process.env` secara tersebar di module/controller/service;
  inject typed config melalui NestJS Config.
- Jangan commit `.env` atau credential nyata.
- Gunakan guard untuk authentication dan authorization.
- Verifikasi akses pada setiap endpoint sensitif, termasuk endpoint yang hanya
  dipakai AdminJS atau frontend internal.
- Terapkan rate limiting pada endpoint publik atau rawan abuse ketika diperlukan.
- Lakukan sanitasi/escaping yang sesuai untuk data yang akan dirender sebagai
  HTML atau dikirim ke integrasi lain.
- Swagger production harus dinonaktifkan atau dilindungi bila bukan dokumentasi
  publik.
- Log harus terstruktur dan memberi konteks operasional tanpa data sensitif.

## 9. Testing

Nama dan lokasi test:

- Unit/integration: `*.spec.ts` di dekat source yang diuji.
- E2E: `*.e2e-spec.ts`, umumnya di folder `test/`.

Aturan testing:

- Gunakan NestJS `TestingModule` untuk menyusun dependency test.
- Fokus pada output dan perilaku publik, bukan detail implementasi internal.
- Mock layanan eksternal, clock, randomness, dan network boundary.
- Jangan mock business collaborator jika integration test memberi keyakinan yang
  lebih baik dengan biaya wajar.
- Test success path, validation failure, authorization failure, not found,
  conflict, dan rollback transaksi yang penting.
- Test harus deterministik, terisolasi, dan tidak bergantung pada urutan test.
- Data E2E tidak boleh memakai database production atau credential production.

## 10. Perintah Development dan Verifikasi

```bash
npm install
npm run start:dev
```

Quality gate minimum untuk perubahan backend:

```bash
npm run lint
npm run test
npm run build
```

Tambahkan bila relevan:

```bash
npm run test:e2e
npm run test:cov
npm run migration:show
```

`npm run format` melakukan write ke source. Periksa diff setelah menjalankannya
dan jangan memformat file yang tidak berhubungan tanpa alasan.

## 11. Checklist Selesai

- Feature ditempatkan pada module/domain yang tepat.
- Controller tipis dan business rule berada di service/use case.
- Input menggunakan DTO dan validation decorator.
- Auth, permission, error path, serta data sensitif telah ditangani.
- Perubahan schema memiliki migration yang telah ditinjau.
- AdminJS dan API memakai business rule yang konsisten.
- Swagger, `.env.example`, dan README diperbarui bila diperlukan.
- Test yang relevan ditambahkan atau disesuaikan.
- Lint, test, dan build berhasil, atau kendala verifikasi dilaporkan dengan jelas.

