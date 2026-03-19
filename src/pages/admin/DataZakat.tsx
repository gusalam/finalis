import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, FileText, Eye, Download, RotateCcw, Printer, FileSpreadsheet } from 'lucide-react';
import SearchInput from '@/components/SearchInput';
import { friendlyError } from '@/lib/errorHandler';
import { useAuth } from '@/contexts/AuthContext';
import { exportPdf } from '@/lib/exportPdf';
import KwitansiZakat, { KwitansiData, DetailZakatItem } from '@/components/KwitansiZakat';
import { usePagination } from '@/hooks/usePagination';
import PaginationControls from '@/components/PaginationControls';
import { downloadKwitansiPdf } from '@/lib/downloadKwitansi';
import ZakatDetailFields, { DetailForm, emptyDetail } from '@/components/ZakatDetailFields';
import DateRangeFilter from '@/components/DateRangeFilter';
import {
  exportWorkbook,
  formatCurrencyId,
  formatDateId,
  getTransactionJenisLabels,
  getTransactionTotalBeras,
  getTransactionTotalJiwa,
  getTransactionTotalUang,
  printHtmlReport,
  STATUS_TRANSAKSI_OPTIONS,
  transactionMatchesJenis,
  ZAKAT_JENIS_OPTIONS,
} from '@/lib/reporting';

const initialForm = () => ({
  nama_muzakki: '',
  rt_id: '',
  tanggal: new Date().toISOString().split('T')[0],
  status_muzakki: 'RT',
  alamat_muzakki: '',
  status_transaksi: 'Sukses',
});

export default function DataZakat() {
  const { user, profile } = useAuth();
  const [allData, setAllData] = useState<any[]>([]);
  const [rtList, setRtList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState(initialForm());
  const [detail, setDetail] = useState<DetailForm>(emptyDetail());
  const [kwitansiOpen, setKwitansiOpen] = useState(false);
  const [kwitansiData, setKwitansiData] = useState<KwitansiData | null>(null);
  const [search, setSearch] = useState('');
  const [filterRt, setFilterRt] = useState('all');
  const [filterJenis, setFilterJenis] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const pag = usePagination(50);

  const fetchData = async () => {
    let query = supabase
      .from('transaksi_zakat')
      .select('*, rt(nama_rt), detail_zakat(*), profiles:created_by(name)')
      .order('tanggal', { ascending: false });

    if (search.trim()) query = query.ilike('nama_muzakki', `%${search.trim()}%`);
    if (filterRt !== 'all') query = query.eq('rt_id', filterRt);
    if (filterStatus !== 'all') query = query.eq('status_transaksi', filterStatus);
    if (startDate) query = query.gte('tanggal', startDate);
    if (endDate) query = query.lte('tanggal', endDate);

    const [{ data: transaksi, error: transaksiError }, { data: rt, error: rtError }] = await Promise.all([
      query,
      supabase.from('rt').select('*').order('nama_rt'),
    ]);

    if (transaksiError) {
      toast.error(friendlyError(transaksiError));
      return;
    }
    if (rtError) {
      toast.error(friendlyError(rtError));
      return;
    }

    setAllData(transaksi || []);
    setRtList(rt || []);
  };

  useEffect(() => {
    fetchData();
  }, [search, filterRt, filterStatus, startDate, endDate]);

  const filteredData = useMemo(
    () => allData.filter((transaction) => transactionMatchesJenis(transaction, filterJenis)),
    [allData, filterJenis],
  );

  useEffect(() => {
    pag.setTotalCount(filteredData.length);
    if (pag.page > Math.max(1, Math.ceil(filteredData.length / 50))) pag.goTo(1);
  }, [filteredData.length]);

  const data = useMemo(() => filteredData.slice(pag.from, pag.to + 1), [filteredData, pag.from, pag.to]);

  const resetForm = () => {
    setForm(initialForm());
    setDetail(emptyDetail());
    setEditItem(null);
  };

  const LITER_PER_JIWA = 3.5;

  type FidyahStoredMeta = {
    type: 'fidyah_meta';
    version: 2;
    metode: 'uang' | 'beras';
    jumlah_hari: number;
    harga_makan_per_hari?: number;
    beras_per_hari?: number;
    input_manual?: boolean;
  };

  const readFidyahMeta = (value: unknown): FidyahStoredMeta | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || (value as { type?: string }).type !== 'fidyah_meta') return null;
    return value as FidyahStoredMeta;
  };

  const validateFidyah = () => {
    if (!detail.fidyah.enabled) return true;

    if (detail.fidyah.metode === 'uang') {
      const harga = Number(detail.fidyah.harga_makan_per_hari);
      const hari = Number(detail.fidyah.jumlah_hari);
      if (!Number.isFinite(harga) || harga <= 0) {
        toast.error('Harga makan per hari harus lebih dari 0');
        return false;
      }
      if (!Number.isFinite(hari) || hari < 1) {
        toast.error('Jumlah hari fidyah minimal 1');
        return false;
      }
      return true;
    }

    if (detail.fidyah.input_manual) {
      const jumlahBeras = Number(detail.fidyah.jumlah_beras);
      if (!Number.isFinite(jumlahBeras) || jumlahBeras <= 0) {
        toast.error('Jumlah beras manual harus lebih dari 0');
        return false;
      }
      return true;
    }

    const berasPerHari = Number(detail.fidyah.beras_per_hari);
    const hari = Number(detail.fidyah.jumlah_hari);
    if (!Number.isFinite(berasPerHari) || berasPerHari <= 0) {
      toast.error('Beras per hari harus lebih dari 0');
      return false;
    }
    if (!Number.isFinite(hari) || hari < 1) {
      toast.error('Jumlah hari fidyah minimal 1');
      return false;
    }
    return true;
  };

  const buildDetails = (): DetailZakatItem[] => {
    const items: DetailZakatItem[] = [];
    if (detail.fitrah.enabled) {
      const jiwa = Number(detail.fitrah.jumlah_jiwa) || 1;
      const metode = detail.fitrah.metode;
      const harga = Number(detail.fitrah.harga_beras_per_liter) || 0;
      const namaAnggota = detail.fitrah.nama_anggota_jiwa.filter((name) => name.trim());
      items.push({
        jenis_zakat: 'Zakat Fitrah',
        jumlah_jiwa: jiwa,
        jumlah_uang: metode === 'uang' ? jiwa * LITER_PER_JIWA * harga : 0,
        jumlah_beras: metode === 'beras' ? jiwa * LITER_PER_JIWA : 0,
        metode_pembayaran: metode,
        harga_beras_per_liter: harga || null,
        nama_anggota_jiwa: namaAnggota.length > 0 ? namaAnggota : null,
      });
    }
    if (detail.mal.enabled) items.push({ jenis_zakat: 'Zakat Mal', jumlah_uang: Number(detail.mal.jumlah_uang) || 0, jumlah_beras: 0, jumlah_jiwa: 0 });
    if (detail.infaq.enabled) items.push({ jenis_zakat: 'Infaq', jumlah_uang: Number(detail.infaq.jumlah_uang) || 0, jumlah_beras: 0, jumlah_jiwa: 0 });
    if (detail.fidyah.enabled) {
      const metode = detail.fidyah.metode;
      if (metode === 'uang') {
        const hargaMakan = Number(detail.fidyah.harga_makan_per_hari) || 0;
        const jumlahHari = Number(detail.fidyah.jumlah_hari) || 0;
        items.push({
          jenis_zakat: 'Fidyah',
          jumlah_jiwa: 0,
          jumlah_uang: hargaMakan * jumlahHari,
          jumlah_beras: 0,
          metode_pembayaran: metode,
          nama_anggota_jiwa: {
            type: 'fidyah_meta',
            version: 2,
            metode: 'uang',
            jumlah_hari: jumlahHari,
            harga_makan_per_hari: hargaMakan,
          } as any,
        });
      } else {
        const inputManual = detail.fidyah.input_manual;
        const jumlahHari = Number(detail.fidyah.jumlah_hari) || 0;
        const berasPerHari = Number(detail.fidyah.beras_per_hari) || 0;
        const totalBeras = inputManual ? Number(detail.fidyah.jumlah_beras) || 0 : berasPerHari * jumlahHari;
        items.push({
          jenis_zakat: 'Fidyah',
          jumlah_jiwa: 0,
          jumlah_uang: 0,
          jumlah_beras: totalBeras,
          metode_pembayaran: metode,
          nama_anggota_jiwa: {
            type: 'fidyah_meta',
            version: 2,
            metode: 'beras',
            jumlah_hari: jumlahHari,
            beras_per_hari: berasPerHari,
            input_manual: inputManual,
          } as any,
        });
      }
    }
    return items;
  };

  const handleSubmit = async () => {
    if (!form.nama_muzakki.trim()) {
      toast.error('Nama muzakki wajib diisi');
      return;
    }
    if (!form.alamat_muzakki.trim()) {
      toast.error('Alamat muzakki wajib diisi untuk transparansi data.');
      return;
    }
    if (!validateFidyah()) return;

    const items = buildDetails();
    if (items.length === 0) {
      toast.error('Pilih minimal satu jenis zakat');
      return;
    }

    if (editItem) {
      const { error } = await supabase
        .from('transaksi_zakat')
        .update({
          nama_muzakki: form.nama_muzakki.trim(),
          rt_id: form.status_muzakki === 'RT' ? form.rt_id || null : null,
          tanggal: form.tanggal,
          status_muzakki: form.status_muzakki,
          alamat_muzakki: form.alamat_muzakki.trim() || null,
          status_transaksi: form.status_transaksi,
        })
        .eq('id', editItem.id);

      if (error) {
        toast.error(friendlyError(error));
        return;
      }

      const { error: deleteError } = await supabase.from('detail_zakat').delete().eq('transaksi_id', editItem.id);
      if (deleteError) {
        toast.error(friendlyError(deleteError));
        return;
      }

      const detailRows = items.map((item) => ({ transaksi_id: editItem.id, ...item, nama_anggota_jiwa: (item.nama_anggota_jiwa ?? null) as any }));
      const { error: detailError } = await supabase.from('detail_zakat').insert(detailRows);
      if (detailError) {
        toast.error(friendlyError(detailError));
        return;
      }
      toast.success('Data zakat berhasil diperbarui ✓');
    } else {
      const { data: inserted, error } = await supabase
        .from('transaksi_zakat')
        .insert({
          nama_muzakki: form.nama_muzakki.trim(),
          rt_id: form.status_muzakki === 'RT' ? form.rt_id || null : null,
          tanggal: form.tanggal,
          created_by: user?.id,
          status_muzakki: form.status_muzakki,
          alamat_muzakki: form.alamat_muzakki.trim() || null,
          status_transaksi: form.status_transaksi,
        })
        .select('id, nomor_kwitansi, receipt_number')
        .single();

      if (error) {
        toast.error(friendlyError(error));
        return;
      }

      const detailRows = items.map((item) => ({ transaksi_id: inserted.id, ...item, nama_anggota_jiwa: (item.nama_anggota_jiwa ?? null) as any }));
      const { error: detailError } = await supabase.from('detail_zakat').insert(detailRows);
      if (detailError) {
        toast.error(friendlyError(detailError));
        return;
      }
      toast.success('Data zakat berhasil ditambahkan ✓');
    }

    setOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const backup = allData;
    setAllData((prev) => prev.filter((item) => item.id !== id));
    const { error: detailError } = await supabase.from('detail_zakat').delete().eq('transaksi_id', id);
    if (detailError) {
      setAllData(backup);
      toast.error(friendlyError(detailError));
      return;
    }
    const { error } = await supabase.from('transaksi_zakat').delete().eq('id', id);
    if (error) {
      setAllData(backup);
      toast.error(friendlyError(error));
      return;
    }
    toast.success('Data zakat berhasil dihapus ✓');
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      nama_muzakki: item.nama_muzakki,
      rt_id: item.rt_id || '',
      tanggal: item.tanggal,
      status_muzakki: item.status_muzakki || 'RT',
      alamat_muzakki: item.alamat_muzakki || '',
      status_transaksi: item.status_transaksi || 'Sukses',
    });

    const detailState = emptyDetail();
    (item.detail_zakat || []).forEach((det: any) => {
      const metode = det.metode_pembayaran || (Number(det.jumlah_beras) > 0 ? 'beras' : 'uang');
      if (det.jenis_zakat === 'Zakat Fitrah') {
        detailState.fitrah = {
          enabled: true,
          jumlah_jiwa: String(det.jumlah_jiwa || 1),
          jumlah_uang: String(det.jumlah_uang || 0),
          jumlah_beras: String(det.jumlah_beras || 0),
          metode: metode as any,
          harga_beras_per_liter: String(det.harga_beras_per_liter || ''),
          nama_anggota_jiwa: Array.isArray(det.nama_anggota_jiwa) ? det.nama_anggota_jiwa : [],
        };
      }
      if (det.jenis_zakat === 'Zakat Mal') detailState.mal = { enabled: true, jumlah_uang: String(det.jumlah_uang || 0) };
      if (det.jenis_zakat === 'Infaq' || det.jenis_zakat === 'Shodaqoh') detailState.infaq = { enabled: true, jumlah_uang: String(det.jumlah_uang || 0) };
      if (det.jenis_zakat === 'Fidyah') {
        const meta = readFidyahMeta(det.nama_anggota_jiwa);
        detailState.fidyah = {
          enabled: true,
          jumlah_uang: String(det.jumlah_uang || 0),
          jumlah_beras: String(det.jumlah_beras || 0),
          metode: metode as any,
          harga_makan_per_hari: metode === 'uang' ? String(meta?.harga_makan_per_hari || det.jumlah_uang || '') : '',
          jumlah_hari: String(meta?.jumlah_hari || 1),
          beras_per_hari: String(meta?.beras_per_hari || 0.7),
          input_manual: metode === 'beras' ? (meta ? !!meta.input_manual : true) : false,
        };
      }
    });

    setDetail(detailState);
    setOpen(true);
  };

  const getCreatorName = (transaction: any) => transaction.profiles?.name || 'Panitia Zakat';

  const toKwitansiData = (transaction: any): KwitansiData => ({
    nomor: transaction.nomor_kwitansi || 0,
    receipt_number: transaction.receipt_number || undefined,
    nama_muzakki: transaction.nama_muzakki,
    status_muzakki: transaction.status_muzakki || undefined,
    rt_nama: transaction.rt?.nama_rt || undefined,
    alamat_muzakki: transaction.alamat_muzakki || undefined,
    details: (transaction.detail_zakat || []).map((detailItem: any) => ({
      jenis_zakat: detailItem.jenis_zakat,
      jumlah_uang: Number(detailItem.jumlah_uang) || 0,
      jumlah_beras: Number(detailItem.jumlah_beras) || 0,
      jumlah_jiwa: Number(detailItem.jumlah_jiwa) || 0,
      metode_pembayaran: detailItem.metode_pembayaran || null,
      harga_beras_per_liter: Number(detailItem.harga_beras_per_liter) || null,
      nama_anggota_jiwa: detailItem.nama_anggota_jiwa ?? null,
    })),
    tanggal: transaction.tanggal,
    penerima: getCreatorName(transaction),
  });

  const showKwitansi = (transaction: any) => {
    setKwitansiData(toKwitansiData(transaction));
    setKwitansiOpen(true);
  };

  const handleDownloadKwitansi = (transaction: any) => downloadKwitansiPdf(toKwitansiData(transaction));

  const filterDescription = [
    `Tanggal cetak: ${formatDateId(new Date())}`,
    `Jenis zakat: ${filterJenis === 'all' ? 'Semua jenis' : filterJenis}`,
    `Status transaksi: ${filterStatus === 'all' ? 'Semua status' : filterStatus}`,
    `RT: ${filterRt === 'all' ? 'Semua RT' : rtList.find((item) => item.id === filterRt)?.nama_rt || '-'}`,
    `Periode: ${startDate || endDate ? `${formatDateId(startDate)} - ${formatDateId(endDate)}` : 'Semua tanggal'}`,
  ].join(' | ');

  const handlePrint = () => {
    printHtmlReport({
      title: 'Laporan Zakat Masjid Al-Ikhlas Kebon Baru',
      subtitle: filterDescription,
      headers: ['No', 'Nama Muzakki', 'Jenis', 'Status', 'Total Uang', 'Total Beras', 'Total Jiwa', 'RT', 'Tanggal'],
      rows: filteredData.map((transaction, index) => [
        String(index + 1),
        transaction.nama_muzakki,
        getTransactionJenisLabels(transaction, filterJenis),
        transaction.status_transaksi || 'Sukses',
        formatCurrencyId(getTransactionTotalUang(transaction, filterJenis)),
        `${getTransactionTotalBeras(transaction, filterJenis)} Liter`,
        String(getTransactionTotalJiwa(transaction, filterJenis)),
        transaction.rt?.nama_rt || '-',
        formatDateId(transaction.tanggal),
      ]),
      orientation: 'landscape',
    });
  };

  const handleExportPdf = () => {
    exportPdf({
      title: 'Laporan Zakat Masjid Al-Ikhlas Kebon Baru',
      subtitle: filterDescription,
      headers: ['No', 'Nama Muzakki', 'Jenis', 'Status', 'Total Uang', 'Total Beras', 'Total Jiwa', 'RT', 'Tanggal'],
      rows: filteredData.map((transaction, index) => [
        String(index + 1),
        transaction.nama_muzakki,
        getTransactionJenisLabels(transaction, filterJenis),
        transaction.status_transaksi || 'Sukses',
        formatCurrencyId(getTransactionTotalUang(transaction, filterJenis)),
        `${getTransactionTotalBeras(transaction, filterJenis)} Liter`,
        String(getTransactionTotalJiwa(transaction, filterJenis)),
        transaction.rt?.nama_rt || '-',
        formatDateId(transaction.tanggal),
      ]),
      filename: 'laporan-zakat-masjid-al-ikhlas.pdf',
      orientation: 'landscape',
    });
  };

  const handleExportExcel = () => {
    exportWorkbook('laporan-zakat-masjid-al-ikhlas.xlsx', [
      {
        name: 'Data Transaksi',
        rows: filteredData.map((transaction, index) => ({
          No: index + 1,
          'Nama Muzakki': transaction.nama_muzakki,
          Jenis: getTransactionJenisLabels(transaction, filterJenis),
          Status: transaction.status_transaksi || 'Sukses',
          'Total Uang': getTransactionTotalUang(transaction, filterJenis),
          'Total Beras (Liter)': getTransactionTotalBeras(transaction, filterJenis),
          'Total Jiwa': getTransactionTotalJiwa(transaction, filterJenis),
          RT: transaction.rt?.nama_rt || '-',
          Tanggal: formatDateId(transaction.tanggal),
        })),
      },
      {
        name: 'Filter',
        rows: [
          { Keterangan: 'Tanggal Cetak', Nilai: formatDateId(new Date()) },
          { Keterangan: 'Jenis Zakat', Nilai: filterJenis === 'all' ? 'Semua jenis' : filterJenis },
          { Keterangan: 'Status Transaksi', Nilai: filterStatus === 'all' ? 'Semua status' : filterStatus },
          { Keterangan: 'RT', Nilai: filterRt === 'all' ? 'Semua RT' : rtList.find((item) => item.id === filterRt)?.nama_rt || '-' },
          { Keterangan: 'Periode', Nilai: startDate || endDate ? `${formatDateId(startDate)} - ${formatDateId(endDate)}` : 'Semua tanggal' },
        ],
      },
    ]);
    toast.success('Excel berhasil diunduh ✓');
  };

  const handleDetailChange = useCallback((updater: (prev: DetailForm) => DetailForm) => {
    setDetail(updater);
  }, []);

  const DeleteButton = ({ id }: { id: string }) => (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="w-4 h-4 text-destructive" /></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Hapus data zakat?</AlertDialogTitle><AlertDialogDescription>Data ini akan dihapus permanen.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(id)}>Hapus</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-xl md:text-2xl font-serif font-bold">Data Zakat</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Tambah</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editItem ? 'Edit' : 'Tambah'} Data Zakat</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Nama Muzakki</Label><Input value={form.nama_muzakki} onChange={(event) => setForm({ ...form, nama_muzakki: event.target.value })} /></div>
                <div><Label>Alamat Muzakki <span className="text-destructive">*</span></Label><Input value={form.alamat_muzakki} onChange={(event) => setForm({ ...form, alamat_muzakki: event.target.value })} placeholder="Contoh: Gang Melati, Jakarta" required /></div>
                <div>
                  <Label>Status Muzakki</Label>
                  <Select value={form.status_muzakki} onValueChange={(value) => setForm({ ...form, status_muzakki: value, rt_id: value === 'Jamaah' ? '' : form.rt_id })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="RT">RT</SelectItem><SelectItem value="Jamaah">Jamaah</SelectItem></SelectContent>
                  </Select>
                </div>
                {form.status_muzakki === 'RT' && (
                  <div><Label>RT</Label>
                    <Select value={form.rt_id} onValueChange={(value) => setForm({ ...form, rt_id: value })}>
                      <SelectTrigger><SelectValue placeholder="Pilih RT" /></SelectTrigger>
                      <SelectContent>{rtList.map((item) => <SelectItem key={item.id} value={item.id}>{item.nama_rt}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Status Transaksi</Label>
                  <Select value={form.status_transaksi} onValueChange={(value) => setForm({ ...form, status_transaksi: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_TRANSAKSI_OPTIONS.filter((item) => item !== 'all').map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <ZakatDetailFields detail={detail} onChange={handleDetailChange} idPrefix="admin" />
                <div><Label>Tanggal</Label><Input type="date" value={form.tanggal} onChange={(event) => setForm({ ...form, tanggal: event.target.value })} /></div>
                <Button onClick={handleSubmit} className="w-full">{editItem ? 'Simpan Perubahan' : 'Tambah Zakat'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_auto]">
          <SearchInput placeholder="Cari nama muzakki..." value={search} onChange={(value) => { setSearch(value); pag.goTo(1); }} />
          <Select value={filterJenis} onValueChange={(value) => { setFilterJenis(value); pag.goTo(1); }}>
            <SelectTrigger><SelectValue placeholder="Jenis zakat" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Jenis</SelectItem>
              {ZAKAT_JENIS_OPTIONS.filter((item) => item !== 'all').map((jenis) => <SelectItem key={jenis} value={jenis}>{jenis}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(value) => { setFilterStatus(value); pag.goTo(1); }}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {STATUS_TRANSAKSI_OPTIONS.filter((item) => item !== 'all').map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterRt} onValueChange={(value) => { setFilterRt(value); pag.goTo(1); }}>
            <SelectTrigger><SelectValue placeholder="RT" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua RT</SelectItem>
              {rtList.map((item) => <SelectItem key={item.id} value={item.id}>{item.nama_rt}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            {(search || filterRt !== 'all' || filterJenis !== 'all' || filterStatus !== 'all' || startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterRt('all'); setFilterJenis('all'); setFilterStatus('all'); setStartDate(undefined); setEndDate(undefined); pag.goTo(1); }}>
                <RotateCcw className="w-4 h-4 mr-1" />Reset
              </Button>
            )}
          </div>
        </div>
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(date) => { setStartDate(date); pag.goTo(1); }}
          onEndDateChange={(date) => { setEndDate(date); pag.goTo(1); }}
        />
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" />Print Data</Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf}><FileText className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}><FileSpreadsheet className="w-4 h-4 mr-1" />Export Excel</Button>
        </div>
      </div>

      <Card className="hidden md:block">
        <CardHeader className="pb-2"><CardTitle className="font-serif text-lg">Riwayat Zakat</CardTitle></CardHeader>
        <CardContent className="overflow-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>No</TableHead><TableHead>Nama</TableHead><TableHead>Status</TableHead><TableHead>Status Transaksi</TableHead><TableHead>Jenis</TableHead><TableHead>Total Uang</TableHead><TableHead>Beras</TableHead><TableHead>RT</TableHead><TableHead>Tanggal</TableHead><TableHead>Input oleh</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-10">Tidak ada data zakat</TableCell></TableRow>
              ) : data.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-mono text-xs">{transaction.receipt_number || transaction.nomor_kwitansi}</TableCell>
                  <TableCell>{transaction.nama_muzakki}</TableCell>
                  <TableCell><span className={`inline-block text-xs px-2 py-0.5 rounded-full ${transaction.status_muzakki === 'Jamaah' ? 'bg-secondary text-secondary-foreground' : 'bg-primary/10 text-primary'}`}>{transaction.status_muzakki || 'RT'}</span></TableCell>
                  <TableCell><span className="inline-block text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{transaction.status_transaksi || 'Sukses'}</span></TableCell>
                  <TableCell>{getTransactionJenisLabels(transaction, filterJenis)}</TableCell>
                  <TableCell>{formatCurrencyId(getTransactionTotalUang(transaction, filterJenis))}</TableCell>
                  <TableCell>{getTransactionTotalBeras(transaction, filterJenis)} Liter</TableCell>
                  <TableCell>{transaction.rt?.nama_rt || '-'}</TableCell>
                  <TableCell>{formatDateId(transaction.tanggal)}</TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{getCreatorName(transaction)}</span></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => showKwitansi(transaction)} title="Lihat Kwitansi"><Eye className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadKwitansi(transaction)} title="Download Kwitansi"><Download className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(transaction)} title="Edit"><Pencil className="w-4 h-4" /></Button>
                      <DeleteButton id={transaction.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-4"><PaginationControls page={pag.page} totalPages={pag.totalPages} totalCount={pag.totalCount} onNext={pag.goNext} onPrev={pag.goPrev} onGoTo={pag.goTo} /></div>
        </CardContent>
      </Card>

      <div className="md:hidden space-y-3">
        {data.length === 0 && <p className="text-center text-muted-foreground py-8">Tidak ada data zakat</p>}
        {data.map((transaction) => (
          <Card key={transaction.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-base">{transaction.receipt_number || `#${transaction.nomor_kwitansi}`} — {transaction.nama_muzakki}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <span className="inline-block text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{getTransactionJenisLabels(transaction, filterJenis) || '-'}</span>
                    <span className="inline-block text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{transaction.status_transaksi || 'Sukses'}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => showKwitansi(transaction)}><Eye className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownloadKwitansi(transaction)}><Download className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(transaction)}><Pencil className="w-4 h-4" /></Button>
                  <DeleteButton id={transaction.id} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Uang:</span> <span className="font-medium">{formatCurrencyId(getTransactionTotalUang(transaction, filterJenis))}</span></div>
                <div><span className="text-muted-foreground">Beras:</span> <span className="font-medium">{getTransactionTotalBeras(transaction, filterJenis)} Liter</span></div>
                <div><span className="text-muted-foreground">RT:</span> <span className="font-medium">{transaction.rt?.nama_rt || '-'}</span></div>
                <div><span className="text-muted-foreground">Tanggal:</span> <span className="font-medium">{formatDateId(transaction.tanggal)}</span></div>
              </div>
            </CardContent>
          </Card>
        ))}
        <PaginationControls page={pag.page} totalPages={pag.totalPages} totalCount={pag.totalCount} onNext={pag.goNext} onPrev={pag.goPrev} onGoTo={pag.goTo} />
      </div>

      <KwitansiZakat open={kwitansiOpen} onOpenChange={setKwitansiOpen} data={kwitansiData} />
    </AdminLayout>
  );
}
