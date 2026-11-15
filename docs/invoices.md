# Invoice SPP

Invoice SPP tersedia untuk owner dan operator dengan izin menu `invoices`. Semua
akses dibatasi tenant, termasuk PDF dan bukti pembayaran.

## Pengaturan awal

1. Jalankan `npm run migration:show`, lalu tinjau dan jalankan
   `npm run migration:run`. Migration baru tidak menerbitkan invoice dan tidak
   mengubah status efektif siswa yang sudah ada.
2. Owner mengatur rekening pada Invoice SPP → Pengaturan → Rekening Pembayaran
   SPP, atau pada Pengaturan → Data Bimbel. Gunakan tombol Simpan Rekening untuk
   menyimpan rekening secara terpisah dari jatuh tempo. Operator dapat melihat
   rekening pada modal invoice, tetapi hanya Owner yang dapat mengubahnya.
   Pembayaran tunai tersedia meski rekening belum diatur.
3. Owner mengisi **Tarif SPP bulanan (Rp)** pada bagian **SPP** saat tambah atau
   ubah siswa. Tarif disimpan dalam transaksi yang sama dengan data siswa dan
   orang tua. Tarif juga bisa diatur dari kartu SPP pada detail siswa.
   Penagihan otomatis pertama dimulai bulan berikutnya. Tarif kosong
   menghentikan invoice baru, tanpa menghapus tunggakan. Perubahan tarif hanya
   berlaku pada invoice yang belum diterbitkan.
4. Gunakan Generate Invoice jika tagihan bulan berjalan perlu diterbitkan manual.
   Pilih **Semua siswa aktif** untuk generate massal atau **Siswa tertentu** untuk
   satu siswa. Cari nama/NIS, pilih siswa, lalu konfirmasi. Tombol **Generate
   Invoice Siswa** pada detail siswa langsung memilih siswa tersebut.
   Tanggal jatuh tempo default adalah tanggal terkonfigurasi atau hari ini,
   mana yang lebih akhir. Periksa hasil siswa yang belum memiliki tarif.

Default jatuh tempo **tanggal 1**, tenggang **0 hari**, menggunakan
**Asia/Jakarta**. Invoice masih bisa dibayar sepanjang tanggal 1; invoice
terlambat dan siswa diblokir mulai tanggal 2. Jika tanggal yang dikonfigurasi
tidak ada dalam suatu bulan, gunakan tanggal terakhir bulan tersebut.

## Otomasi dan status siswa

Backend memeriksa tagihan saat startup dan setiap menit. Job merekonsiliasi
tunggakan sebelum menerbitkan invoice. Perubahan status akibat waktu berlaku pada
pemeriksaan berikutnya, biasanya dalam satu menit selama backend berjalan.
Restart melengkapi invoice bulan berjalan yang memenuhi syarat, tanpa membuat
tagihan untuk bulan lampau. Job dapat dijalankan beberapa instance: unique
constraint dan penguncian transaksi siswa mencegah invoice ganda.

Status efektif siswa adalah aktif jika `administrativeStatus=active` dan
`billingBlocked=false`. Pembayaran semua tunggakan melewati tenggang menghapus
blokir SPP, tetapi tidak membatalkan penonaktifan administratif. Perubahan status
melalui endpoint siswa juga tidak dapat melewati blokir SPP.

Siswa nonaktif tidak menerima invoice baru. Setelah aktif kembali, penagihan
otomatis dilanjutkan bulan berikutnya; bulan jeda tidak ditagih. Penempatan baru
menggunakan status efektif, sedangkan jadwal dan presensi lama tetap tersimpan.

## Transaksi

- Satu invoice per tenant, siswa, dan bulan. Tarif per siswa tidak dikalikan
  jumlah kelompok belajar.
- Generate per siswa hanya memproses siswa terpilih dari tenant aktif. Siswa
  harus aktif dan tarifnya sudah diatur; target tidak valid ditolak dan tidak
  pernah dialihkan menjadi generate massal. Invoice bulan yang sudah tersedia
  dilewati. Generate per siswa tidak merekonsiliasi status siswa lain.
- Invoice menyimpan snapshot identitas, wali, kelompok, rekening, tarif,
  jatuh tempo, dan tenggang. Perubahan master berlaku pada invoice berikutnya.
- Status publik: `paid`, `unpaid`, `overdue`. `overdue` dihitung dari tanggal WIB.
  Ringkasan memisahkan belum bayar dan terlambat; pending adalah jumlah keduanya.
  Ringkasan mengikuti pencarian/periode/kelompok/siswa dan mengabaikan filter status.
- Rincian terdiri dari tepat satu `tuition`, ditambah `charge` dan/atau `discount`.
  Nominal item positif, quantity 1–120, total akhir harus positif. Potongan
  dikurangkan oleh backend. Rincian invoice lunas terkunci.
- Pelunasan menutup seluruh total. Tanggal pembayaran wajib menyertakan zona
  waktu dan tidak boleh di masa depan atau sebelum tanggal terbit.
- Pembayaran memerlukan UUID `requestId` dan `version` invoice. Retry dengan
  request dan payload identik tidak menggandakan pembayaran. Payload berbeda
  dengan requestId sama, versi lama, atau invoice yang sudah lunas menghasilkan 409.
- Pembatalan pencatatan memerlukan versi terbaru dan alasan. Record pembayaran
  serta buktinya dipertahankan; status siswa dihitung ulang. Tidak ada refund.

## API

Kontrak lengkap tersedia pada Swagger, tag **Invoices**. Prefix default `/api/v1`:

| Endpoint                                           | Kegunaan                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /invoices`                                    | List: page, limit, search, period YYYY-MM, status, groupId, studentId              |
| `GET /invoices/summary`                            | Total nominal dan jumlah per status                                                |
| `GET /invoices/options`                            | Pilihan filter kelompok dari tenant                                                |
| `GET /invoices/student-options`                    | Pilihan siswa aktif: pagination dan pencarian nama/NIS; memakai izin menu invoices |
| `GET/PATCH /invoices/settings`                     | dueDay (1–31), graceDays (0–90)                                                    |
| `GET/PATCH /invoices/students/:id/billing-profile` | monthlyFee (1–1 miliar rupiah atau null), nextInvoicePeriod                        |
| `POST /invoices/generations`                       | Generate bulan berjalan, dueDate opsional; studentId opsional untuk satu siswa     |
| `GET /invoices/:id`                                | Detail, item, pembayaran, dan audit                                                |
| `PATCH /invoices/:id/items`                        | version dan array items                                                            |
| `POST /invoices/:id/payments`                      | JSON atau multipart; requestId, version, paidAt, method, reference?, note?, file?  |
| `POST /invoices/:id/payments/:paymentId/reversals` | version dan reason                                                                 |
| `GET /invoices/:id/payments/:paymentId/proof`      | Gambar privat, wajib autentikasi                                                   |
| `GET /invoices/:id/pdf`                            | Download PDF                                                                       |
| `GET/PATCH /tenants/me/invoice-payment-account`    | Owner: rekening tujuan invoice berikutnya                                          |

`method` bernilai `cash` atau `bank_transfer`. Transfer hanya tersedia jika
invoice menyimpan rekening tujuan. Bukti opsional: satu file JPG/PNG, maksimal 5 MB.

Endpoint owner `POST /students/registrations` dan
`PATCH /students/:id/registration` menerima `monthlyFee` opsional, bilangan bulat
1–1 miliar rupiah atau `null`. Pada tambah siswa, field yang tidak dikirim berarti
tarif belum diatur. Pada ubah siswa, field yang tidak dikirim mempertahankan tarif
lama; `null` mengosongkan tarif dan periode penagihan berikutnya. Kegagalan
validasi/konflik data membatalkan seluruh transaksi. Endpoint siswa umum tidak
memberikan akses ke tarif SPP.

## Penyimpanan dan operasi

`INVOICE_AUTOMATION_ENABLED=true` mengaktifkan job. Unit/E2E test tidak menjalankan
job berkala; pengujian memanggil service dengan clock terkontrol.

`INVOICE_PROOF_STORAGE_PATH=storage/invoice-proofs` harus berada di luar
`uploads/` publik. Persist dan backup direktori ini bersama database. Setiap
instance backend perlu mengakses penyimpanan bukti yang sama jika aplikasi
dijalankan dengan beberapa instance. Endpoint tidak mengekspos path penyimpanan.

Rollback migration ditolak jika riwayat invoice sudah ada, untuk mencegah
hilangnya catatan pembayaran. Rollback sebelum fitur digunakan menghapus tabel
baru dan mengembalikan status administratif siswa. Setelah digunakan, lakukan
backup dan rencana pemulihan tersendiri.

Tidak termasuk: cicilan, prorata, saldo lebih, payment gateway, portal orang tua,
refund, atau pengiriman WhatsApp/email otomatis.
