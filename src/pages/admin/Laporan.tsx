import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, Printer, Users } from 'lucide-react';
import SearchInput from '@/components/SearchInput';
import { exportPdf } from '@/lib/exportPdf';
import { friendlyError } from '@/lib/errorHandler';
import { toast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/usePagination';
import PaginationControls from '@/components/PaginationControls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DateRangeFilter from '@/components/DateRangeFilter';
import {
  buildGrandTotalLines,
  buildZakatGrandTotals,
  exportWorkbook,
  formatCurrencyId,
  formatDateId,
  formatNumberId,
  getTransactionJenisLabels,
  getTransactionTotalBeras,
  getTransactionTotalJiwa,
  getTransactionTotalUang,
  printHtmlReport,
  transactionMatchesJenis,
  ZAKAT_JENIS_OPTIONS,
} from '@/lib/reporting';

interface PanitiaOption {
  id: string;
  name: string;
}

const getAlamatLabel = (rt?: string, alamat?: string) => [rt, alamat].filter(Boolean).join(' — ');

export default function Laporan() {
  const [allZakatData, setAllZakatData] = useState<any[]>([]);
  const [zakatData, setZakatData] = useState<any[]>([]);
  const [distribusiData, setDistribusiData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [searchZakat, setSearchZakat] = useState('');
  const [searchDist, setSearchDist] = useState('');
  const [filterJenis, setFilterJenis] = useState('all');
  const zakatPag = usePagination(50);
  const distPag = usePagination(50);
  const [panitiaList, setPanitiaList] = useState<PanitiaOption[]>([]);
  const [selectedPanitia, setSelectedPanitia] = useState<string>('all');

  useEffect(() => {
    const fetchPanitia = async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'panitia');
      if (!roles?.length) return setPanitiaList([]);
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', roles.map((role) => role.user_id)).order('name');
      setPanitiaList((profiles || []).map((profile) => ({ id: profile.id, name: profile.name })));
    };
    fetchPanitia();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const distJoin = searchDist.trim() ? 'mustahik!inner(nama, alamat, rt(nama_rt))' : 'mustahik(nama, alamat, rt(nama_rt))';
        let zq = supabase.from('transaksi_zakat').select('*, rt(nama_rt), detail_zakat(*)').order('tanggal', { ascending: false });
        let dq = supabase.from('distribusi').select(`*, ${distJoin}`).order('tanggal', { ascending: false });

        if (startDate) { zq = zq.gte('tanggal', startDate); dq = dq.gte('tanggal', startDate); }
        if (endDate) { zq = zq.lte('tanggal', endDate); dq = dq.lte('tanggal', endDate); }
        if (searchZakat.trim()) zq = zq.ilike('nama_muzakki', `%${searchZakat.trim()}%`);
        if (searchDist.trim()) dq = dq.ilike('mustahik.nama', `%${searchDist.trim()}%`);
        if (selectedPanitia !== 'all') { zq = zq.eq('created_by', selectedPanitia); dq = dq.eq('created_by', selectedPanitia); }

        const [zResult, dResult] = await Promise.all([zq, dq]);
        if (zResult.error) throw zResult.error;
        if (dResult.error) throw dResult.error;

        setAllZakatData(zResult.data || []);
        setDistribusiData(dResult.data || []);
      } catch (err) {
        toast({ title: 'Gagal memuat data', description: friendlyError(err), variant: 'destructive' });
      }
    };
    fetchData();
  }, [startDate, endDate, searchZakat, searchDist, selectedPanitia]);

  useEffect(() => {
    const filtered = allZakatData.filter((item) => transactionMatchesJenis(item, filterJenis));
    setZakatData(filtered);
  }, [allZakatData, filterJenis]);

  useEffect(() => {
    zakatPag.setTotalCount(zakatData.length);
    distPag.setTotalCount(distribusiData.length);
  }, [zakatData.length, distribusiData.length]);

  const pagedZakatData = useMemo(() => zakatData.slice(zakatPag.from, zakatPag.to + 1), [zakatData, zakatPag.from, zakatPag.to]);
  const pagedDistribusiData = useMemo(() => distribusiData.slice(distPag.from, distPag.to + 1), [distribusiData, distPag.from, distPag.to]);
  const selectedPanitiaName = selectedPanitia === 'all' ? 'Semua Panitia' : panitiaList.find((item) => item.id === selectedPanitia)?.name || 'Panitia';
  const filterLabel = [`Tanggal cetak: ${formatDateId(new Date())}`, `Jenis zakat: ${filterJenis === 'all' ? 'Semua jenis' : filterJenis}`, `Panitia: ${selectedPanitiaName}`, `Periode: ${startDate || endDate ? `${formatDateId(startDate)} - ${formatDateId(endDate)}` : 'Semua tanggal'}`].join(' | ');
  const summary = buildZakatGrandTotals(zakatData, filterJenis);
  const totalLines = buildGrandTotalLines(summary, filterJenis);
  const totalMuzakki = new Set(zakatData.map((item) => item.nama_muzakki)).size;
  const totalTransaksi = zakatData.length;

  const exportRows = zakatData.map((item, index) => ({
    No: index + 1,
    'Nama Muzakki': item.nama_muzakki,
    Alamat: getAlamatLabel(item.rt?.nama_rt, item.alamat_muzakki) || '-',
    Jenis: getTransactionJenisLabels(item, filterJenis),
    'Total Jiwa': getTransactionTotalJiwa(item, filterJenis),
    'Total Beras (Liter)': getTransactionTotalBeras(item, filterJenis),
    'Total Uang': getTransactionTotalUang(item, filterJenis),
    Tanggal: formatDateId(item.tanggal),
  }));

  const handleExportPdf = () => exportPdf({
    title: 'Laporan Zakat Masjid Al-Ikhlas Kebon Baru',
    subtitle: filterLabel,
    headers: ['No', 'Nama Muzakki', 'Alamat', 'Jenis', 'Total Jiwa', 'Total Beras', 'Total Uang', 'Tanggal'],
    rows: zakatData.map((item, index) => [String(index + 1), item.nama_muzakki, getAlamatLabel(item.rt?.nama_rt, item.alamat_muzakki) || '-', getTransactionJenisLabels(item, filterJenis), String(getTransactionTotalJiwa(item, filterJenis)), `${formatNumberId(getTransactionTotalBeras(item, filterJenis))} Liter`, formatCurrencyId(getTransactionTotalUang(item, filterJenis)), formatDateId(item.tanggal)]),
    filename: 'laporan-zakat-masjid-al-ikhlas.pdf',
    orientation: 'landscape',
    sections: [{ title: 'Grand Total', lines: totalLines }],
  });

  const handlePrint = () => printHtmlReport({
    title: 'Laporan Zakat Masjid Al-Ikhlas Kebon Baru',
    subtitle: filterLabel,
    headers: ['No', 'Nama Muzakki', 'Alamat', 'Jenis', 'Total Jiwa', 'Total Beras', 'Total Uang', 'Tanggal'],
    rows: zakatData.map((item, index) => [String(index + 1), item.nama_muzakki, getAlamatLabel(item.rt?.nama_rt, item.alamat_muzakki) || '-', getTransactionJenisLabels(item, filterJenis), String(getTransactionTotalJiwa(item, filterJenis)), `${formatNumberId(getTransactionTotalBeras(item, filterJenis))} Liter`, formatCurrencyId(getTransactionTotalUang(item, filterJenis)), formatDateId(item.tanggal)]),
    orientation: 'landscape',
    sections: [{ title: 'Grand Total', lines: totalLines }],
  });

  const handleExportExcel = () => {
    exportWorkbook('laporan-zakat-masjid-al-ikhlas.xlsx', [
      { name: 'Data Transaksi', rows: exportRows },
      { name: 'Ringkasan Total', rows: totalLines.map((line, index) => ({ No: index + 1, Ringkasan: line })) },
    ]);
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-serif font-bold">Laporan</h1>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <DateRangeFilter startDate={startDate} endDate={endDate} onStartDateChange={(date) => { setStartDate(date); zakatPag.goTo(1); distPag.goTo(1); }} onEndDateChange={(date) => { setEndDate(date); zakatPag.goTo(1); distPag.goTo(1); }} />
          <Select value={filterJenis} onValueChange={(value) => { setFilterJenis(value); zakatPag.goTo(1); }}>
            <SelectTrigger className="w-full lg:w-[180px]"><SelectValue placeholder="Jenis zakat" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Semua Jenis</SelectItem>{ZAKAT_JENIS_OPTIONS.filter((item) => item !== 'all').map((jenis) => <SelectItem key={jenis} value={jenis}>{jenis}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={selectedPanitia} onValueChange={(value) => { setSelectedPanitia(value); zakatPag.goTo(1); distPag.goTo(1); }}>
              <SelectTrigger className="w-full lg:w-[200px]"><SelectValue placeholder="Pilih Panitia" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Semua Panitia</SelectItem>{panitiaList.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" />Print</Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf}><FileText className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}><Download className="w-4 h-4 mr-1" />Export Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Muzakki</p><p className="text-2xl font-bold">{totalMuzakki}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Transaksi</p><p className="text-2xl font-bold">{totalTransaksi}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Beras</p><p className="text-2xl font-bold">{formatNumberId(zakatData.reduce((sum, item) => sum + getTransactionTotalBeras(item, filterJenis), 0))} L</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Uang</p><p className="text-lg font-bold break-words">{formatCurrencyId(zakatData.reduce((sum, item) => sum + getTransactionTotalUang(item, filterJenis), 0))}</p></CardContent></Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2"><CardTitle className="font-serif text-lg">Data Transaksi</CardTitle><SearchInput placeholder="Cari nama muzakki..." value={searchZakat} onChange={(value) => { setSearchZakat(value); zakatPag.goTo(1); }} className="w-full max-w-64" /></CardHeader>
        <CardContent className="overflow-auto p-4">
          <Table>
            <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Alamat</TableHead><TableHead>Jenis</TableHead><TableHead>Jiwa</TableHead><TableHead>Beras</TableHead><TableHead>Uang</TableHead><TableHead>Tanggal</TableHead></TableRow></TableHeader>
            <TableBody>{pagedZakatData.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada data</TableCell></TableRow> : pagedZakatData.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.nama_muzakki}</TableCell><TableCell className="text-sm text-muted-foreground">{getAlamatLabel(item.rt?.nama_rt, item.alamat_muzakki) || '-'}</TableCell><TableCell>{getTransactionJenisLabels(item, filterJenis)}</TableCell><TableCell>{getTransactionTotalJiwa(item, filterJenis)}</TableCell><TableCell>{formatNumberId(getTransactionTotalBeras(item, filterJenis))} Liter</TableCell><TableCell>{formatCurrencyId(getTransactionTotalUang(item, filterJenis))}</TableCell><TableCell>{formatDateId(item.tanggal)}</TableCell></TableRow>)}</TableBody>
          </Table>
          <PaginationControls page={zakatPag.page} totalPages={zakatPag.totalPages} totalCount={zakatPag.totalCount} onNext={zakatPag.goNext} onPrev={zakatPag.goPrev} onGoTo={zakatPag.goTo} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2"><CardTitle className="font-serif text-lg">Data Distribusi</CardTitle><SearchInput placeholder="Cari nama mustahik..." value={searchDist} onChange={(value) => { setSearchDist(value); distPag.goTo(1); }} className="w-full max-w-64" /></CardHeader>
        <CardContent className="overflow-auto p-4">
          <Table>
            <TableHeader><TableRow><TableHead>Mustahik</TableHead><TableHead>Alamat</TableHead><TableHead>Jenis</TableHead><TableHead>Jumlah</TableHead><TableHead>Tanggal</TableHead></TableRow></TableHeader>
            <TableBody>{pagedDistribusiData.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Belum ada data</TableCell></TableRow> : pagedDistribusiData.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.mustahik?.nama || '-'}</TableCell><TableCell className="text-sm text-muted-foreground">{getAlamatLabel(item.mustahik?.rt?.nama_rt, item.mustahik?.alamat) || '-'}</TableCell><TableCell>{item.jenis_bantuan || 'Uang'}</TableCell><TableCell>{item.jenis_bantuan === 'Beras' ? `${formatNumberId(Number(item.jumlah_beras) || 0)} Liter` : formatCurrencyId(Number(item.jumlah) || 0)}</TableCell><TableCell>{formatDateId(item.tanggal)}</TableCell></TableRow>)}</TableBody>
          </Table>
          <PaginationControls page={distPag.page} totalPages={distPag.totalPages} totalCount={distPag.totalCount} onNext={distPag.goNext} onPrev={distPag.goPrev} onGoTo={distPag.goTo} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-serif text-lg">Grand Total</CardTitle></CardHeader>
        <CardContent className="space-y-2">{totalLines.length === 0 ? <p className="text-muted-foreground">Belum ada ringkasan</p> : totalLines.map((line) => <p key={line} className="text-sm">{line}</p>)}</CardContent>
      </Card>
    </AdminLayout>
  );
}
