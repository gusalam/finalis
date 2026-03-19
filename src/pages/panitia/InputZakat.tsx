import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PanitiaLayout from '@/components/layouts/PanitiaLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Eye, Download, Printer, FileText, FileSpreadsheet, RotateCcw } from 'lucide-react';
import SearchInput from '@/components/SearchInput';
import { friendlyError } from '@/lib/errorHandler';
import { useAuth } from '@/contexts/AuthContext';
import KwitansiZakat, { KwitansiData, DetailZakatItem } from '@/components/KwitansiZakat';
import { usePagination } from '@/hooks/usePagination';
import PaginationControls from '@/components/PaginationControls';
import { downloadKwitansiPdf } from '@/lib/downloadKwitansi';
import ZakatDetailFields, { DetailForm, emptyDetail } from '@/components/ZakatDetailFields';
import DateRangeFilter from '@/components/DateRangeFilter';
import { exportPdf } from '@/lib/exportPdf';
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

interface MuzakkiSuggestion {
  nama_muzakki: string;
  jumlah_jiwa: number;
  rt_id: string | null;
}

const emptyForm = () => ({
  nama_muzakki: '', rt_id: '', tanggal: new Date().toISOString().split('T')[0],
  penerima: '', alamat: '', status_muzakki: 'RT', alamat_muzakki: '', status_transaksi: 'Sukses',
});

export default function InputZakat() {
  const { user, profile } = useAuth();
  const [allData, setAllData] = useState<any[]>([]);
  const [rtList, setRtList] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [detail, setDetail] = useState<DetailForm>(emptyDetail());
  const [showForm, setShowForm] = useState(false);
  const [kwitansiOpen, setKwitansiOpen] = useState(false);
  const [kwitansiData, setKwitansiData] = useState<KwitansiData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pag = usePagination(50);
  const [listSearch, setListSearch] = useState('');
  const [filterJenis, setFilterJenis] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<MuzakkiSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    let query = supabase
      .from('transaksi_zakat')
      .select('*, rt(nama_rt), detail_zakat(*), profiles:created_by(name)')
      .order('tanggal', { ascending: false });

    if (listSearch.trim()) query = query.ilike('nama_muzakki', `%${listSearch.trim()}%`);
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
  }, [listSearch, filterStatus, startDate, endDate]);

  const filteredData = useMemo(
    () => allData.filter((transaction) => transactionMatchesJenis(transaction, filterJenis)),
    [allData, filterJenis],
  );

  useEffect(() => {
    pag.setTotalCount(filteredData.length);
    if (pag.page > Math.max(1, Math.ceil(filteredData.length / 50))) pag.goTo(1);
  }, [filteredData.length]);

  const data = useMemo(() => filteredData.slice(pag.from, pag.to + 1), [filteredData, pag.from, pag.to]);

  const searchMuzakki = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const { data } = await supabase
      .from('transaksi_zakat')
      .select('nama_muzakki, rt_id')
      .ilike('nama_muzakki', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(20);
    const seen = new Map<string, MuzakkiSuggestion>();
    (data || []).forEach((item) => {
      if (!seen.has(item.nama_muzakki)) {
        seen.set(item.nama_muzakki, { nama_muzakki: item.nama_muzakki, jumlah_jiwa: 1, rt_id: item.rt_id });
      }
    });
    setSuggestions(Array.from(seen.values()));
  }, []);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    setForm((prev) => ({ ...prev, nama_muzakki: value }));
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      searchMuzakki(value);
      setShowSuggestions(true);
    }, 300);
  };

  const selectMuzakki = (selected: MuzakkiSuggestion) => {
    setForm((prev) => ({ ...prev, nama_muzakki: selected.nama_muzakki, rt_id: selected.rt_id || '' }));
    setSearchQuery(selected.nama_muzakki);
    setShowSuggestions(false);
  };

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const resetForm = () => {
    setForm(emptyForm());
    setDetail(emptyDetail());
    setSearchQuery('');
    setShowSuggestions(false);
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
        jumlah_uang: metode === 'uang' ? jiwa * LITER_PER_JIWA * harga : 0,
        jumlah_beras: metode === 'beras' ? jiwa * LITER_PER_JIWA : 0,
        jumlah_jiwa: jiwa,
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
          jumlah_uang: hargaMakan * jumlahHari,
          jumlah_beras: 0,
          jumlah_jiwa: 0,
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
          jumlah_uang: 0,
          jumlah_beras: totalBeras,
          jumlah_jiwa: 0,
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
    if (submitting) return;
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

    setSubmitting(true);
    try {
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

      toast.success(`Zakat ${form.nama_muzakki} berhasil disimpan`);
      const rtName = form.status_muzakki === 'RT' && form.rt_id ? rtList.find((item) => item.id === form.rt_id)?.nama_rt : undefined;
      setKwitansiData({ nomor: inserted.nomor_kwitansi, receipt_number: inserted.receipt_number, nama_muzakki: form.nama_muzakki, status_muzakki: form.status_muzakki || undefined, rt_nama: rtName, alamat_muzakki: form.alamat_muzakki.trim() || undefined, details: items, tanggal: form.tanggal, penerima: profile?.name || 'Panitia Zakat' });
      setKwitansiOpen(true);
      resetForm();
      setShowForm(false);
      fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  const getCreatorName = (transaction: any) => transaction.profiles?.name || 'Panitia Zakat';

  const toKwitansiData = (transaction: any): KwitansiData => ({
    nomor: transaction.nomor_kwitansi || 0,
    receipt_number: transaction.receipt_number || undefined,
    nama_muzakki: transaction.nama_muzakki,
    status_muzakki: transaction.status_muzakki || undefined,
    rt_nama: transaction.rt?.nama_rt || undefined,
    alamat_muzakki: transaction.alamat_muzakki || undefined,
    details: (transaction.detail_zakat || []).map((detailItem: any) => ({ jenis_zakat: detailItem.jenis_zakat, jumlah_uang: Number(detailItem.jumlah_uang) || 0, jumlah_beras: Number(detailItem.jumlah_beras) || 0, jumlah_jiwa: Number(detailItem.jumlah_jiwa) || 0, metode_pembayaran: detailItem.metode_pembayaran || null, harga_beras_per_liter: Number(detailItem.harga_beras_per_liter) || null, nama_anggota_jiwa: detailItem.nama_anggota_jiwa ?? null })),
    tanggal: transaction.tanggal,
    penerima: getCreatorName(transaction),
  });

  const showKwitansi = (transaction: any) => {
    setKwitansiData(toKwitansiData(transaction));
    setKwitansiOpen(true);
  };
  const handleDownloadKwitansi = (transaction: any) => {
    downloadKwitansiPdf(toKwitansiData(transaction));
  };

  const handleDetailChange = useCallback((updater: (prev: DetailForm) => DetailForm) => {
    setDetail(updater);
  }, []);

  const filterDescription = [
    `Tanggal cetak: ${formatDateId(new Date())}`,
    `Jenis zakat: ${filterJenis === 'all' ? 'Semua jenis' : filterJenis}`,
    `Status transaksi: ${filterStatus === 'all' ? 'Semua status' : filterStatus}`,
    `Periode: ${startDate || endDate ? `${formatDateId(startDate)} - ${formatDateId(endDate)}` : 'Semua tanggal'}`,
  ].join(' | ');

  const handlePrint = () => {
    printHtmlReport({
      title: 'Laporan Zakat Masjid Al-Ikhlas Kebon Baru',
      subtitle: filterDescription,
      headers: ['No', 'Nama Muzakki', 'Jenis', 'Status', 'Total Uang', 'Total Beras', 'Total Jiwa', 'Tanggal'],
      rows: filteredData.map((transaction, index) => [
        String(index + 1),
        transaction.nama_muzakki,
        getTransactionJenisLabels(transaction, filterJenis),
        transaction.status_transaksi || 'Sukses',
        formatCurrencyId(getTransactionTotalUang(transaction, filterJenis)),
        `${getTransactionTotalBeras(transaction, filterJenis)} Liter`,
        String(getTransactionTotalJiwa(transaction, filterJenis)),
        formatDateId(transaction.tanggal),
      ]),
      orientation: 'landscape',
    });
  };

  const handleExportPdf = () => {
    exportPdf({
      title: 'Laporan Zakat Masjid Al-Ikhlas Kebon Baru',
      subtitle: filterDescription,
      headers: ['No', 'Nama Muzakki', 'Jenis', 'Status', 'Total Uang', 'Total Beras', 'Total Jiwa', 'Tanggal'],
      rows: filteredData.map((transaction, index) => [
        String(index + 1),
        transaction.nama_muzakki,
        getTransactionJenisLabels(transaction, filterJenis),
        transaction.status_transaksi || 'Sukses',
        formatCurrencyId(getTransactionTotalUang(transaction, filterJenis)),
        `${getTransactionTotalBeras(transaction, filterJenis)} Liter`,
        String(getTransactionTotalJiwa(transaction, filterJenis)),
        formatDateId(transaction.tanggal),
      ]),
      filename: 'laporan-zakat-panitia.pdf',
      orientation: 'landscape',
    });
  };

  const handleExportExcel = () => {
    exportWorkbook('laporan-zakat-panitia.xlsx', [
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
          Tanggal: formatDateId(transaction.tanggal),
        })),
      },
      {
        name: 'Filter',
        rows: [
          { Keterangan: 'Tanggal Cetak', Nilai: formatDateId(new Date()) },
          { Keterangan: 'Jenis Zakat', Nilai: filterJenis === 'all' ? 'Semua jenis' : filterJenis },
          { Keterangan: 'Status Transaksi', Nilai: filterStatus === 'all' ? 'Semua status' : filterStatus },
          { Keterangan: 'Periode', Nilai: startDate || endDate ? `${formatDateId(startDate)} - ${formatDateId(endDate)}` : 'Semua tanggal' },
        ],
      },
    ]);
    toast.success('Excel berhasil diunduh ✓');
  };

  return (
    <PanitiaLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-xl md:text-2xl font-serif font-bold">Input Zakat</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-1" />{showForm ? 'Tutup Form' : 'Tambah Zakat'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-lg">Form Input Zakat</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="relative" ref={suggestionsRef}>
              <Label>Nama Muzakki <span className="text-destructive">*</span></Label>
              <Input value={searchQuery || form.nama_muzakki} onChange={(event) => handleSearchInput(event.target.value)} onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }} placeholder="Masukkan nama muzakki" />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {suggestions.map((item, index) => (
                    <button key={`${item.nama_muzakki}-${index}`} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors" onClick={() => selectMuzakki(item)}>
                      <span className="font-medium">{item.nama_muzakki}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Status Muzakki</Label>
              <Select value={form.status_muzakki} onValueChange={(value) => setForm({ ...form, status_muzakki: value, rt_id: value === 'Jamaah' ? '' : form.rt_id })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="RT">RT</SelectItem><SelectItem value="Jamaah">Jamaah</SelectItem></SelectContent>
              </Select>
            </div>

            {form.status_muzakki === 'RT' && (
              <div>
                <Label>RT</Label>
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

            <div><Label>Alamat Muzakki <span className="text-destructive">*</span></Label><Input value={form.alamat_muzakki} onChange={(event) => setForm({ ...form, alamat_muzakki: event.target.value })} placeholder="Contoh: Gang Melati, Jakarta" required /></div>

            <ZakatDetailFields detail={detail} onChange={handleDetailChange} idPrefix="panitia" />

            <div><Label>Tanggal Transaksi</Label><Input type="date" value={form.tanggal} onChange={(event) => setForm({ ...form, tanggal: event.target.value })} /></div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} disabled={submitting}><Plus className="w-4 h-4 mr-1" />Simpan</Button>
              <Button variant="outline" onClick={() => { resetForm(); setShowForm(false); }}>Batal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4 mb-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
          <SearchInput placeholder="Cari nama muzakki..." value={listSearch} onChange={(value) => { setListSearch(value); pag.goTo(1); }} />
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
          {(listSearch || filterJenis !== 'all' || filterStatus !== 'all' || startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setListSearch(''); setFilterJenis('all'); setFilterStatus('all'); setStartDate(undefined); setEndDate(undefined); pag.goTo(1); }}>
              <RotateCcw className="w-4 h-4 mr-1" />Reset
            </Button>
          )}
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
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="font-serif text-lg">Riwayat Zakat</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>No</TableHead><TableHead>Nama</TableHead><TableHead>Status</TableHead><TableHead>Status Transaksi</TableHead><TableHead>Jenis</TableHead><TableHead>Total Uang</TableHead><TableHead>Beras</TableHead><TableHead>Tanggal</TableHead><TableHead>Input oleh</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">Tidak ada data zakat</TableCell></TableRow>
              ) : data.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-mono text-xs">{transaction.receipt_number || transaction.nomor_kwitansi}</TableCell>
                  <TableCell>{transaction.nama_muzakki}</TableCell>
                  <TableCell><span className={`inline-block text-xs px-2 py-0.5 rounded-full ${transaction.status_muzakki === 'Jamaah' ? 'bg-secondary text-secondary-foreground' : 'bg-primary/10 text-primary'}`}>{transaction.status_muzakki || 'RT'}</span></TableCell>
                  <TableCell><span className="inline-block text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{transaction.status_transaksi || 'Sukses'}</span></TableCell>
                  <TableCell>{getTransactionJenisLabels(transaction, filterJenis)}</TableCell>
                  <TableCell>{formatCurrencyId(getTransactionTotalUang(transaction, filterJenis))}</TableCell>
                  <TableCell>{getTransactionTotalBeras(transaction, filterJenis)} Liter</TableCell>
                  <TableCell>{formatDateId(transaction.tanggal)}</TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{getCreatorName(transaction)}</span></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => showKwitansi(transaction)} title="Lihat Kwitansi"><Eye className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadKwitansi(transaction)} title="Download Kwitansi"><Download className="w-4 h-4" /></Button>
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
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Uang:</span> <span className="font-medium">{formatCurrencyId(getTransactionTotalUang(transaction, filterJenis))}</span></div>
                <div><span className="text-muted-foreground">Beras:</span> <span className="font-medium">{getTransactionTotalBeras(transaction, filterJenis)} Liter</span></div>
                <div><span className="text-muted-foreground">Tanggal:</span> <span className="font-medium">{formatDateId(transaction.tanggal)}</span></div>
                <div><span className="text-muted-foreground">Input oleh:</span> <span className="font-medium">{getCreatorName(transaction)}</span></div>
              </div>
            </CardContent>
          </Card>
        ))}
        <PaginationControls page={pag.page} totalPages={pag.totalPages} totalCount={pag.totalCount} onNext={pag.goNext} onPrev={pag.goPrev} onGoTo={pag.goTo} />
      </div>

      <KwitansiZakat open={kwitansiOpen} onOpenChange={setKwitansiOpen} data={kwitansiData} />
    </PanitiaLayout>
  );
}
