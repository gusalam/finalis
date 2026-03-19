import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import PanitiaLayout from '@/components/layouts/PanitiaLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, RotateCcw, Printer, FileText, FileSpreadsheet } from 'lucide-react';
import SearchInput from '@/components/SearchInput';
import { friendlyError } from '@/lib/errorHandler';
import { usePagination } from '@/hooks/usePagination';
import PaginationControls from '@/components/PaginationControls';
import ImportMustahik from '@/components/ImportMustahik';
import { exportPdf } from '@/lib/exportPdf';
import {
  exportWorkbook,
  formatDateId,
  getMustahikTotalJiwa,
  KATEGORI_OPTIONS,
  MUSTAHIK_TYPE_OPTIONS,
  printHtmlReport,
} from '@/lib/reporting';

const emptyForm = { nama: '', rt_id: '', kategori: '', alamat: '', status: 'RT', jumlah_tanggungan: '' };

export default function PanitiaMustahik() {
  const { user } = useAuth();
  const [allData, setAllData] = useState<any[]>([]);
  const [rtList, setRtList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const pag = usePagination(50);
  const [search, setSearch] = useState('');
  const [filterRt, setFilterRt] = useState('all');
  const [filterKategori, setFilterKategori] = useState('all');
  const [filterTipe, setFilterTipe] = useState('all');

  const fetchData = async () => {
    const [{ data: mustahik, error: mustahikError }, { data: rt, error: rtError }] = await Promise.all([
      supabase.from('mustahik').select('*, rt(nama_rt)').order('nama'),
      supabase.from('rt').select('*').order('nama_rt'),
    ]);

    if (mustahikError) {
      toast.error(friendlyError(mustahikError));
      return;
    }
    if (rtError) {
      toast.error(friendlyError(rtError));
      return;
    }

    setAllData(mustahik || []);
    setRtList(rt || []);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    return allData.filter((item) => {
      const matchesSearch = !search.trim() || item.nama?.toLowerCase().includes(search.trim().toLowerCase());
      const matchesRt = filterRt === 'all' || item.rt_id === filterRt;
      const matchesKategori = filterKategori === 'all' || item.kategori === filterKategori;
      const matchesTipe = filterTipe === 'all' || (item.status || 'RT') === filterTipe;
      return matchesSearch && matchesRt && matchesKategori && matchesTipe;
    });
  }, [allData, search, filterRt, filterKategori, filterTipe]);

  useEffect(() => {
    pag.setTotalCount(filteredData.length);
    if (pag.page > Math.max(1, Math.ceil(filteredData.length / 50))) pag.goTo(1);
  }, [filteredData.length]);

  const data = useMemo(() => filteredData.slice(pag.from, pag.to + 1), [filteredData, pag.from, pag.to]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditItem(null);
  };

  const handleSubmit = async () => {
    if (!form.nama.trim()) {
      toast.error('Nama wajib diisi');
      return;
    }
    if (!form.kategori) {
      toast.error('Kategori wajib dipilih');
      return;
    }
    if (form.status === 'RT' && !form.rt_id) {
      toast.error('RT wajib dipilih jika status RT');
      return;
    }

    const tanggungan = parseInt(String(form.jumlah_tanggungan), 10);
    if (Number.isNaN(tanggungan) || tanggungan < 0) {
      toast.error('Jumlah tanggungan tidak valid (minimal 0)');
      return;
    }

    const payload: any = {
      nama: form.nama.trim(),
      rt_id: form.rt_id || null,
      kategori: form.kategori || null,
      alamat: form.alamat.trim() || null,
      status: form.status,
      jumlah_tanggungan: tanggungan,
      ...(editItem ? {} : { created_by: user?.id }),
    };

    if (editItem) {
      const { error } = await supabase.from('mustahik').update(payload).eq('id', editItem.id);
      if (error) {
        toast.error(friendlyError(error));
        return;
      }
      toast.success('Data mustahik berhasil diperbarui ✓');
    } else {
      const { error } = await supabase.from('mustahik').insert(payload);
      if (error) {
        toast.error(friendlyError(error));
        return;
      }
      toast.success('Data mustahik berhasil ditambahkan ✓');
    }

    setOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const currentData = allData;
    setAllData((prev) => prev.filter((item) => item.id !== id));
    const { error } = await supabase.from('mustahik').delete().eq('id', id);
    if (error) {
      setAllData(currentData);
      toast.error(friendlyError(error));
      return;
    }
    toast.success('Data mustahik berhasil dihapus ✓');
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      nama: item.nama,
      rt_id: item.rt_id || '',
      kategori: item.kategori || '',
      alamat: item.alamat || '',
      status: item.status || 'RT',
      jumlah_tanggungan: String(item.jumlah_tanggungan ?? 0),
    });
    setOpen(true);
  };

  const filterDescription = [
    `Tanggal cetak: ${formatDateId(new Date())}`,
    `Pencarian: ${search.trim() || 'Semua nama'}`,
    `Kategori: ${filterKategori === 'all' ? 'Semua kategori' : filterKategori}`,
    `Tipe: ${filterTipe === 'all' ? 'Semua tipe' : filterTipe}`,
    `RT: ${filterRt === 'all' ? 'Semua RT' : rtList.find((item) => item.id === filterRt)?.nama_rt || '-'}`,
  ].join(' | ');

  const totalTanggungan = filteredData.reduce((sum, item) => sum + (Number(item.jumlah_tanggungan) || 0), 0);
  const totalJiwa = filteredData.reduce((sum, item) => sum + getMustahikTotalJiwa(item), 0);

  const handleExportPdf = () => {
    exportPdf({
      title: 'Data Mustahik Masjid Al-Ikhlas Kebon Baru',
      subtitle: filterDescription,
      headers: ['No', 'Nama', 'Status Penerima', 'RT', 'Kategori', 'Tanggungan', 'Total Jiwa', 'Alamat'],
      rows: filteredData.map((item, index) => [
        String(index + 1),
        item.nama || '-',
        item.status || '-',
        item.rt?.nama_rt || '-',
        item.kategori || '-',
        String(Number(item.jumlah_tanggungan) || 0),
        String(getMustahikTotalJiwa(item)),
        item.alamat || '-',
      ]),
      filename: 'data-mustahik-masjid-al-ikhlas.pdf',
      orientation: 'landscape',
      sections: [
        {
          title: 'Ringkasan',
          lines: [
            `Total Mustahik: ${filteredData.length}`,
            `Total Tanggungan: ${totalTanggungan}`,
            `Total Jiwa: ${totalJiwa}`,
          ],
        },
      ],
    });
  };

  const handlePrint = () => {
    printHtmlReport({
      title: 'Data Mustahik Masjid Al-Ikhlas Kebon Baru',
      subtitle: filterDescription,
      headers: ['No', 'Nama', 'Status Penerima', 'RT', 'Kategori', 'Tanggungan', 'Total Jiwa', 'Alamat'],
      rows: filteredData.map((item, index) => [
        String(index + 1),
        item.nama || '-',
        item.status || '-',
        item.rt?.nama_rt || '-',
        item.kategori || '-',
        String(Number(item.jumlah_tanggungan) || 0),
        String(getMustahikTotalJiwa(item)),
        item.alamat || '-',
      ]),
      orientation: 'landscape',
      sections: [
        {
          title: 'Ringkasan',
          lines: [
            `Total Mustahik: ${filteredData.length}`,
            `Total Tanggungan: ${totalTanggungan}`,
            `Total Jiwa: ${totalJiwa}`,
          ],
        },
      ],
    });
  };

  const handleExportExcel = () => {
    exportWorkbook('data-mustahik-masjid-al-ikhlas.xlsx', [
      {
        name: 'Data Mustahik',
        rows: filteredData.map((item, index) => ({
          No: index + 1,
          Nama: item.nama || '-',
          'Status Penerima': item.status || '-',
          RT: item.rt?.nama_rt || '-',
          Kategori: item.kategori || '-',
          'Jumlah Tanggungan': Number(item.jumlah_tanggungan) || 0,
          'Total Jiwa': getMustahikTotalJiwa(item),
          Alamat: item.alamat || '-',
        })),
      },
      {
        name: 'Ringkasan',
        rows: [
          { Keterangan: 'Tanggal Cetak', Nilai: formatDateId(new Date()) },
          { Keterangan: 'Pencarian', Nilai: search.trim() || 'Semua nama' },
          { Keterangan: 'Kategori', Nilai: filterKategori === 'all' ? 'Semua kategori' : filterKategori },
          { Keterangan: 'Tipe', Nilai: filterTipe === 'all' ? 'Semua tipe' : filterTipe },
          { Keterangan: 'RT', Nilai: filterRt === 'all' ? 'Semua RT' : rtList.find((item) => item.id === filterRt)?.nama_rt || '-' },
          { Keterangan: 'Total Mustahik', Nilai: filteredData.length },
          { Keterangan: 'Total Tanggungan', Nilai: totalTanggungan },
          { Keterangan: 'Total Jiwa', Nilai: totalJiwa },
        ],
      },
    ]);
    toast.success('Excel berhasil diunduh ✓');
  };

  const DeleteButton = ({ id }: { id: string }) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus mustahik?</AlertDialogTitle>
          <AlertDialogDescription>Data ini akan dihapus permanen.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={() => handleDelete(id)}>Hapus</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const formDialog = (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Tambah</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{editItem ? 'Edit' : 'Tambah'} Mustahik</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Nama</Label><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></div>
          <div><Label>Alamat</Label><Input value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} placeholder="Alamat mustahik" /></div>
          <div>
            <Label>Status Penerima</Label>
            <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value, rt_id: value === 'Jamaah' ? '' : form.rt_id })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RT">RT</SelectItem>
                <SelectItem value="Jamaah">Jamaah</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.status === 'RT' && (
            <div>
              <Label>RT <span className="text-destructive">*</span></Label>
              <Select value={form.rt_id} onValueChange={(value) => setForm({ ...form, rt_id: value })}>
                <SelectTrigger><SelectValue placeholder="Pilih RT" /></SelectTrigger>
                <SelectContent>{rtList.map((item) => <SelectItem key={item.id} value={item.id}>{item.nama_rt}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {form.status === 'Jamaah' && (
            <div>
              <Label>RT (opsional)</Label>
              <Select value={form.rt_id} onValueChange={(value) => setForm({ ...form, rt_id: value })}>
                <SelectTrigger><SelectValue placeholder="Pilih RT (opsional)" /></SelectTrigger>
                <SelectContent>{rtList.map((item) => <SelectItem key={item.id} value={item.id}>{item.nama_rt}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Kategori <span className="text-destructive">*</span></Label>
            <Select value={form.kategori} onValueChange={(value) => setForm({ ...form, kategori: value })}>
              <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
              <SelectContent>{KATEGORI_OPTIONS.map((kategori) => <SelectItem key={kategori} value={kategori}>{kategori}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Jumlah Tanggungan</Label><Input type="number" min={0} value={form.jumlah_tanggungan} onChange={(e) => setForm({ ...form, jumlah_tanggungan: e.target.value })} /></div>
          <Button onClick={handleSubmit} className="w-full">{editItem ? 'Simpan' : 'Tambah'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <PanitiaLayout>
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-xl md:text-2xl font-serif font-bold">Data Mustahik</h1>
          <div className="flex gap-2 flex-wrap items-center">
            <ImportMustahik createdBy={user?.id} onImportDone={fetchData} />
            {formDialog}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_auto]">
          <SearchInput placeholder="Cari nama mustahik..." value={search} onChange={(value) => { setSearch(value); pag.goTo(1); }} />
          <Select value={filterKategori} onValueChange={(value) => { setFilterKategori(value); pag.goTo(1); }}>
            <SelectTrigger><SelectValue placeholder="Kategori" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {KATEGORI_OPTIONS.map((kategori) => <SelectItem key={kategori} value={kategori}>{kategori}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipe} onValueChange={(value) => { setFilterTipe(value); pag.goTo(1); }}>
            <SelectTrigger><SelectValue placeholder="Tipe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tipe</SelectItem>
              {MUSTAHIK_TYPE_OPTIONS.filter((item) => item !== 'all').map((tipe) => <SelectItem key={tipe} value={tipe}>{tipe}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterRt} onValueChange={(value) => { setFilterRt(value); pag.goTo(1); }}>
            <SelectTrigger><SelectValue placeholder="RT" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua RT</SelectItem>
              {rtList.map((item) => <SelectItem key={item.id} value={item.id}>{item.nama_rt}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2 flex-wrap">
            {(search || filterRt !== 'all' || filterKategori !== 'all' || filterTipe !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterRt('all'); setFilterKategori('all'); setFilterTipe('all'); pag.goTo(1); }}>
                <RotateCcw className="w-4 h-4 mr-1" />Reset
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" />Print Data Mustahik</Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf}><FileText className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}><FileSpreadsheet className="w-4 h-4 mr-1" />Export Excel</Button>
        </div>
      </div>

      <Card className="hidden md:block">
        <CardContent className="overflow-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Status</TableHead><TableHead>RT</TableHead><TableHead>Kategori</TableHead><TableHead>Tanggungan</TableHead><TableHead>Total Jiwa</TableHead><TableHead>Alamat</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Tidak ada data mustahik</TableCell></TableRow>
              ) : data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.nama}</TableCell>
                  <TableCell>{item.status || '-'}</TableCell>
                  <TableCell>{item.rt?.nama_rt || '-'}</TableCell>
                  <TableCell>{item.kategori || '-'}</TableCell>
                  <TableCell>{Number(item.jumlah_tanggungan) || 0} Orang</TableCell>
                  <TableCell>{getMustahikTotalJiwa(item)} Jiwa</TableCell>
                  <TableCell>{item.alamat || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="w-4 h-4" /></Button>
                      <DeleteButton id={item.id} />
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
        {data.length === 0 && <p className="text-center text-muted-foreground py-8">Tidak ada data mustahik</p>}
        {data.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-base">{item.nama}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <span className="inline-block text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{item.kategori || '-'}</span>
                    <span className="inline-block text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{item.status || '-'}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Pencil className="w-4 h-4" /></Button>
                  <DeleteButton id={item.id} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">RT:</span> <span className="font-medium">{item.rt?.nama_rt || '-'}</span></div>
                <div><span className="text-muted-foreground">Tanggungan:</span> <span className="font-medium">{Number(item.jumlah_tanggungan) || 0}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Total Jiwa:</span> <span className="font-medium">{getMustahikTotalJiwa(item)} Jiwa</span></div>
              </div>
              {item.alamat && <p className="text-sm text-muted-foreground">{item.alamat}</p>}
            </CardContent>
          </Card>
        ))}
        <PaginationControls page={pag.page} totalPages={pag.totalPages} totalCount={pag.totalCount} onNext={pag.goNext} onPrev={pag.goPrev} onGoTo={pag.goTo} />
      </div>
    </PanitiaLayout>
  );
}
