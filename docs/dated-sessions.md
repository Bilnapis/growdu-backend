# Jadwal bertanggal dan rekaman pertemuan

## Model dan penggunaan

`study_group_configurations` menyimpan revisi lengkap pola mingguan dan anggota.
`class_sessions` menyimpan pelaksanaan konkret beserta snapshot roster. Semua
tanggal bisnis memakai Asia/Jakarta, DATE dan TIME tanpa konversi timezone SQL.
Tanggal akhir konfigurasi inklusif. Rentang dibatasi lima tahun per permintaan.

- POST `/study-groups/:id/configurations`: `effectiveFrom`, `effectiveUntil`,
  `schedules`, `studentIds`, dan opsional `name`.
- POST `/study-groups/:id/configurations/preview`: estimasi jumlah kandidat,
  sesi yang dapat diganti, dan sesi yang dilindungi. Bukan reservasi jadwal;
  konflik diperiksa kembali dalam transaksi penyimpanan.
- GET `/study-groups/:id/configurations`: seluruh riwayat revisi.
- GET `/class-sessions`: filter tanggal, kelompok, tentor, status, status
  presensi, pencarian nama kelompok, serta pagination.
- GET `/class-sessions/:id`: detail langsung dengan roster snapshot.
- PATCH `/class-sessions/:id`: override satu sesi; `version` dan `reason` wajib.
- PUT `/class-sessions/:id/record`: `version`, seluruh `attendance`, `topic`,
  dan opsional `tutorNote`, disimpan atomik.

Revisi mengganti konfigurasi sejak tanggal efektif, termasuk revisi berikutnya
jika dilakukan backdate. Konfigurasi yang seluruh periodenya digantikan diberi
`supersededAt`; konfigurasi yang masih memiliki periode sebelumnya ditutup satu
hari sebelum tanggal efektif. Riwayat dan sesi final tidak dihapus.

Sesi kosong yang dapat diganti diregenerasi (ID sesi dapat berubah). Respons
`created` menghitung baris baru, `updated` menghitung baris kosong yang diganti,
dan `skipped` menghitung sesi yang dipertahankan. Sesi completed, cancelled,
terkunci, berisi data, atau pernah di-override dipertahankan. `seriesId` dan
`occurrenceDate` menjaga identitas pertemuan asal setelah reschedule. Ketika
mengedit pola, kirim kembali ID rule agar garis riwayatnya tetap jelas.

Lock transaksi tenant menserialisasi mutasi konfigurasi, override, dan rekaman;
version check menolak draft usang dengan 409. Konflik jadwal diperiksa pada
tanggal konkret untuk kelompok, tentor, ruangan, dan siswa. Owner/operator
mengelola tenantnya; tentor hanya sesi penugasannya. Koreksi rekaman final boleh
hingga `lockedAt` terisi. Payroll belum menyediakan proses penguncian.

Status master kelompok tidak membatalkan sesi yang sudah dibuat secara implisit;
pembatalan satu tanggal menggunakan override dengan alasan dan audit.
Endpoint `/schedules` masih menyediakan proyeksi pola konfigurasi terbaru,
bukan sesi operasional. PATCH kelompok lama adalah adapter deprecated; POST
kelompok tetap dipakai untuk membuat kelompok sekaligus konfigurasi pertama.

## Penerapan dan rollback

1. Backup MySQL dan hentikan sementara write aplikasi.
2. Jalankan `npm run migration:show`, lalu `npm run migration:run` dari backend.
3. Deploy backend dan frontend bersama sebelum membuka kembali write.
4. Periksa satu kelompok, tanggal awal/akhir, jumlah sesi, dan roster snapshot.

Migrasi legacy membuat satu konfigurasi per kelompok mulai tanggal Jakarta saat
migrasi hingga enam bulan kalender berikutnya; sesi hanya untuk kelompok aktif.
Migrasi tidak menebak presensi maupun histori sebelum tanggal tersebut.
MySQL DDL tidak sepenuhnya transactional: kegagalan deployment membutuhkan
inspeksi schema/backup sebelum retry, bukan menyalakan `synchronize`.

`npm run migration:verify` memakai database sementara terisolasi, mencakup
run–revert–run, backfill data legacy, roster, dan pemulihan relasi lama.
Rollback migrasi ditolak setelah ada audit rekaman/override atau revisi konfigurasi,
agar histori bisnis tidak hilang. Gunakan backup terverifikasi untuk rollback
setelah aplikasi mulai mencatat data.

Migrasi telah diterapkan pada database lokal `growdu` pada 26 Oktober 2026:
1 konfigurasi, 54 sesi, dan 108 snapshot peserta untuk rentang 26 Oktober 2026
hingga 26 April 2027. Pemeriksaan relasi rule dan jumlah roster tidak menemukan
ketidaksesuaian. Backup tabel/data/trigger dibuat sebelum migrasi; routines dan
events tidak disertakan karena metadata MariaDB lokal bermasalah.

## Status verifikasi

Unit test, E2E alur sesi, dan verifikasi migrasi legacy telah dijalankan.
Pengulangan E2E setelah perubahan terakhir pada query agregasi ruangan terhalang
batas persetujuan akses database; wajib diulang sebelum deploy. Guard rollback
tambahan untuk revisi konfigurasi juga perlu diverifikasi ulang.
Frontend belum memiliki test runner; pengujian interaksi browser dan viewport
375/1280 masih harus dilakukan. Build/lint bukan pengganti pengujian tersebut.
