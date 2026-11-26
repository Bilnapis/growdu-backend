# Penggajian tentor

## Setup dan aktivasi

1. Jalankan `npm run migration:show`, tinjau migration `CreatePayroll20261116000000`, lalu jalankan `npm run migration:run`.
2. Pastikan `PAYROLL_PROOF_STORAGE_PATH` berada di luar folder publik `uploads/`, dapat ditulis backend, dan dipersistenkan pada deployment. Nilai default: `storage/payroll-proofs`.
3. Isi tarif positif melalui tambah/ubah tentor. Data tarif lama tetap dipertahankan; tarif nol dilewati dengan ringkasan saat generate.
4. Buka **Penggajian → Pengaturan** untuk menyimpan tanggal 1–31 dan aktivasi otomatis. Bimbel yang belum dikonfigurasi langsung memakai tanggal 1 dan generate otomatis; pengaturan serta siklus disiapkan saat halaman dibuka atau worker berjalan. Pengaturan yang sudah disimpan tetap dipertahankan. `PAYROLL_AUTOMATION_ENABLED=false` mematikan worker secara global tanpa menghalangi generate manual.

## Siklus dan perhitungan

Kalender menggunakan Asia/Jakarta. Tanggal gaji menjadi tanggal generate otomatis dan jatuh tempo. Generate manual tersedia setelah periode sesi selesai, tanpa menunggu tanggal gajian. Contoh: sesi 1–30 November dapat dibuat payroll-nya mulai 1 Desember WIB meskipun tanggal gajian 23 Desember. Pembuatan payroll tidak menandainya lunas; pembayaran tetap dicatat terpisah. Periode perhitungan selalu satu bulan kalender penuh sebelum bulan penggajian: tanggal 5 November mencakup sesi 1–31 Oktober, dan tanggal 5 Maret mencakup 1–28/29 Februari. Tanggal gaji yang tidak tersedia mengikuti akhir bulan; tanggal 31 kembali digunakan pada bulan yang memilikinya.

Saat default diinisialisasi atau konfigurasi pertama disimpan, sistem menyiapkan siklus menuju tanggal gaji terdekat yang belum lewat. Histori sebelum siklus pertama tidak dibentuk otomatis, tetapi dapat dibuat manual melalui pilihan bulan sesi yang sudah selesai. Mengubah tanggal hanya mengubah tanggal gaji dalam bulan pembayaran periode yang belum diterbitkan; bulan sesi dan rentang perhitungan tetap. Jika tanggal baru sudah lewat, periode langsung dapat digenerate manual dan worker memprosesnya pada tick berikutnya bila otomatisasi aktif. Siklus yang sudah diterbitkan tidak berubah. Periode berikutnya selalu melanjutkan bulan sesi berikutnya, sehingga perubahan tanggal tidak membuat periode tambahan untuk bulan yang sama.

Migration `UseCalendarPayrollPeriods20261123000000` menyesuaikan periode yang belum diterbitkan tanpa mengubah ID, tanggal gaji, atau pengaturan. Hentikan worker dan write payroll selama migration. Migration menolak bila terdapat payroll dengan rentang lama: tinjau transisi tenant terlebih dahulu, jangan menghapus riwayat operasional. Rentang periode asli disimpan pada tabel backup migration untuk rollback persis. Rollback ditolak jika periode sudah diproses, diterbitkan, jadwal berubah, atau ada periode baru yang belum diterbitkan; gunakan backup yang ditinjau untuk kondisi tersebut.

Sumber adalah sesi `completed`, berdasarkan `sessionDate`, tentor pada sesi, dan kelompok belajar. Setiap sesi dihitung sekali, termasuk jika seluruh siswa tercatat tidak hadir. Sesi scheduled/cancelled tidak dihitung. Tentor nonaktif yang memiliki sesi tersimpan tetap berhak masuk perhitungan.

Tarif diambil saat generate dan disimpan sebagai `defaultRate`. Tarif master yang berubah tidak mengubah payroll lama. Jumlah dibayar = jumlah sesi sumber + selisih koreksi. Koreksi jumlah wajib memiliki alasan. Perbarui dari Presensi mempertahankan selisih koreksi, tarif per kelompok, dan tambahan/potongan. Total harus positif; nominal memakai string desimal maksimal dua angka dan perhitungan integer dalam satuan terkecil.

Dialog **Buat Penggajian** menyediakan pilihan **Bulan sesi**, secara default bulan terakhir yang sudah selesai. Generate manual melalui `POST /api/v1/payroll/generations/by-month` menerima `sessionMonth` (`YYYY-MM`) dan `tutorId` opsional. Endpoint berbasis `periodId` tetap tersedia. Bulan berjalan/future ditolak. Periode yang belum ada dibuat saat generate, dengan tanggal gaji pada bulan sesudah bulan sesi memakai pengaturan saat itu. Jika periode sudah ada, tanggalnya dipertahankan. Pembuatan bulan lama tidak mengisi ulang atau mengubah jadwal otomatis yang sudah tersedia.

Generate berulang melewati payroll yang sudah ada. Untuk tentor yang sebelumnya dilewati karena tarif kosong, perbaiki tarif lalu generate kembali pada periode tersebut. Pilihan satu tentor juga tersedia tanpa memerlukan akses menu master tentor.

## Pembayaran, pembatalan, dan slip

Pembayaran merupakan pencatatan manual: sistem tidak memindahkan uang. Metode tunai atau transfer bank/e-wallet; transfer memerlukan rekening yang sudah tersimpan pada snapshot payroll. Bukti JPG/PNG maksimal 5 MB bersifat opsional dan privat. Tanggal pembayaran harus antara tanggal terbit dan waktu sekarang.

Pembayaran memakai `requestId` UUID dan `version`. Pengulangan request identik tidak membuat transaksi ganda. Presensi yang berubah memerlukan pembaruan rincian sebelum pembayaran. Pada pembayaran, snapshot slip disimpan dan sesi sumber dikunci menggunakan `lockReason=payroll:<id>`.

Pembatalan wajib beralasan dan hanya membatalkan pencatatan pembayaran. Riwayat, bukti, dan snapshot lama dipertahankan; sesi milik payroll tersebut dibuka kembali. PDF transaksi yang dibatalkan diberi penanda. Setelah perbaikan, pembayaran ulang memakai `requestId` baru. Akun tentor hanya dapat membaca slip pembayaran aktif miliknya.

## API dan akses

Swagger mendokumentasikan `/api/v1/payroll` untuk owner/operator dengan permission `payroll` dan `/api/v1/tutor/payroll` untuk akun tentor. Semua data dibatasi tenant. Endpoint mencakup daftar, summary, periode, pengaturan, pencarian tentor, generate, rincian, perhitungan ulang, pembayaran, pembatalan, bukti, PDF, dan export CSV sesuai filter.

Summary `totalAmount` mengikuti bulan jatuh tempo dan filter daftar; `paidAmount` menghitung transaksi pembayaran aktif berdasarkan bulan pembayaran WIB. Dashboard memakai kedua pengertian tersebut secara terpisah.

Worker berjalan saat startup dan setiap menit. Setiap tick memproses maksimal 24 siklus tertinggal per bimbel aktif. Kegagalan dicoba kembali pada tick berikutnya; periksa event log `payroll_generation` dan `payroll_generation_failed`. Duplikasi antarkerja dicegah dengan lock tenant, unique constraint, serta penanda siklus terproses. Lampiran tidak boleh dihapus saat pembayaran dibatalkan.

## Verifikasi dan rollback

- `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`, `npm run migration:show`.
- `npm run migration:verify:payroll-calendar` menguji konversi periode, up/down/up, penolakan riwayat lama, perlindungan rollback, dan pelestarian pengaturan serta periode terbit pada database sementara yang dibuat/dihapus sendiri.
- `npm run migration:verify:payroll` menguji up/down/up, data tarif lama, isolasi tenant, constraint, dan perlindungan riwayat pada database sementara `growdu_payroll_migration_*` yang dibuat/dihapus sendiri.
- Migration down menolak dijalankan jika sudah ada payroll, termasuk yang belum dibayar. Gunakan backup yang ditinjau untuk pemulihan riwayat; jangan menghapus catatan gaji agar rollback dapat dipaksakan.
