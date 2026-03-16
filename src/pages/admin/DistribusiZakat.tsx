import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Calculator, Save, FileText, FileSpreadsheet, Users, Package, Divide } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useZakatStats } from '@/hooks/useZakatStats';
import { exportPdf } from '@/lib/exportPdf';
import { friendlyError } from '@/lib/errorHandler';

interface MustahikItem {
  id: string;
  nama: string;
  jumlah_tanggungan: number;
  kategori: string | null;
  rt: { nama_rt: string } | null;
}

interface DistribusiRow {
  mustahik_id: string;
  nama: string;
  kategori: string | null;
  rt_nama: string;
  jumlah_tanggungan: number;
  total_jiwa: number;
  jatah_beras: number;
}

export default function DistribusiZakat() {
  const { user } = useAuth();
  const { stats, fetchStats } = useZakatStats();
  const [mustahikList, setMustahikList] = useState<MustahikItem[]>([]);
  const [distribusi, setDistribusi] = useState<DistribusiRow[]>([]);
  const [calculated, setCalculated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedData, setSavedData] = useState<any[]>([]);

  const fetchData = async () => {
    const [{ data: mustahik }, _] = await Promise.all([
      supabase.from('mustahik').select('id, nama, jumlah_tanggungan, kategori, rt(nama_rt)'),
      fetchStats(),
    ]);
    setMustahikList(mustahik || []);

    // Load existing saved distributions
    const { data: existing } = await supabase
      .from('distribusi_zakat')
      .select('*, mustahik(nama, jumlah_tanggungan, kategori, rt(nama_rt))');
    setSavedData(existing || []);
  };

  useEffect(() => { fetchData(); }, []);

  const totalBerasZakat = stats.totalBeras;

  const totalJiwaMustahik = useMemo(() => {
    return mustahikList.reduce((sum, m) => sum + 1 + (m.jumlah_tanggungan || 0), 0);
  }, [mustahikList]);

  const jatahPerJiwa = totalJiwaMustahik > 0 ? totalBerasZakat / totalJiwaMustahik : 0;

  const handleHitung = () => {
    if (mustahikList.length === 0) {
      toast.error('Tidak ada data mustahik');
      return;
    }
    if (totalBerasZakat <= 0) {
      toast.error('Total beras zakat masih 0');
      return;
    }

    const rows: DistribusiRow[] = mustahikList.map((m) => {
      const totalJiwa = 1 + (m.jumlah_tanggungan || 0);
      return {
        mustahik_id: m.id,
        nama: m.nama,
        kategori: m.kategori,
        rt_nama: m.rt?.nama_rt || '-',
        jumlah_tanggungan: m.jumlah_tanggungan || 0,
        total_jiwa: totalJiwa,
        jatah_beras: Math.round(totalJiwa * jatahPerJiwa * 100) / 100,
      };
    });

    rows.sort((a, b) => b.jatah_beras - a.jatah_beras);
    setDistribusi(rows);
    setCalculated(true);
    toast.success('Perhitungan distribusi selesai ✓');
  };

  const handleSimpan = async () => {
    if (!calculated || distribusi.length === 0) return;
    setSaving(true);
    try {
      // Delete old data first
      await supabase.from('distribusi_zakat').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      const payload = distribusi.map((d) => ({
        mustahik_id: d.mustahik_id,
        total_jiwa: d.total_jiwa,
        jatah_beras: d.jatah_beras,
        tanggal_distribusi: new Date().toISOString().split('T')[0],
        created_by: user?.id,
      }));

      const { error } = await supabase.from('distribusi_zakat').insert(payload);
      if (error) {
        toast.error(friendlyError(error));
        return;
      }
      toast.success('Data distribusi berhasil disimpan ✓');
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = () => {
    const rows = (calculated ? distribusi : savedData.map(d => ({
      nama: d.mustahik?.nama || '-',
      rt_nama: d.mustahik?.rt?.nama_rt || '-',
      jumlah_tanggungan: d.mustahik?.jumlah_tanggungan || 0,
      total_jiwa: d.total_jiwa,
      jatah_beras: d.jatah_beras,
    }))).map((d, i) => [
      String(i + 1),
      d.nama,
      d.rt_nama,
      String(d.jumlah_tanggungan),
      String(d.total_jiwa),
      `${d.jatah_beras} Liter`,
    ]);

    exportPdf({
      title: 'Laporan Distribusi Zakat',
      subtitle: `Total Beras: ${totalBerasZakat} Liter | Total Jiwa: ${totalJiwaMustahik} | Jatah/Jiwa: ${jatahPerJiwa.toFixed(2)} Liter | Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      headers: ['No', 'Nama Mustahik', 'RT', 'Tanggungan', 'Total Jiwa', 'Jatah Beras'],
      rows,
      filename: `distribusi-zakat-${new Date().toISOString().split('T')[0]}.pdf`,
    });
  };

  const handleExportExcel = () => {
    const dataRows = calculated ? distribusi : savedData.map(d => ({
      nama: d.mustahik?.nama || '-',
      rt_nama: d.mustahik?.rt?.nama_rt || '-',
      jumlah_tanggungan: d.mustahik?.jumlah_tanggungan || 0,
      total_jiwa: d.total_jiwa,
      jatah_beras: d.jatah_beras,
    }));

    const header = 'No\tNama Mustahik\tRT\tTanggungan\tTotal Jiwa\tJatah Beras (Liter)\n';
    const body = dataRows.map((d, i) =>
      `${i + 1}\t${d.nama}\t${d.rt_nama}\t${d.jumlah_tanggungan}\t${d.total_jiwa}\t${d.jatah_beras}`
    ).join('\n');

    const footer = `\n\nTotal Beras Zakat\t${totalBerasZakat} Liter\nTotal Jiwa Mustahik\t${totalJiwaMustahik}\nJatah per Jiwa\t${jatahPerJiwa.toFixed(2)} Liter`;

    const blob = new Blob([header + body + footer], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `distribusi-zakat-${new Date().toISOString().split('T')[0]}.xls`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Excel berhasil diunduh ✓');
  };

  const displayData = calculated ? distribusi : savedData.map(d => ({
    mustahik_id: d.mustahik_id,
    nama: d.mustahik?.nama || '-',
    kategori: d.mustahik?.kategori || null,
    rt_nama: d.mustahik?.rt?.nama_rt || '-',
    jumlah_tanggungan: d.mustahik?.jumlah_tanggungan || 0,
    total_jiwa: d.total_jiwa,
    jatah_beras: d.jatah_beras,
  }));

  const hasData = displayData.length > 0;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-xl md:text-2xl font-serif font-bold">Distribusi Zakat Otomatis</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Beras Zakat</p>
              <p className="text-lg font-bold">{totalBerasZakat} Liter</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Jiwa Mustahik</p>
              <p className="text-lg font-bold">{totalJiwaMustahik} Jiwa</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Divide className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Jatah Beras per Jiwa</p>
              <p className="text-lg font-bold">{jatahPerJiwa.toFixed(2)} Liter</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button onClick={handleHitung} className="gap-2">
          <Calculator className="w-4 h-4" />
          Hitung Pembagian Zakat
        </Button>
        {hasData && (
          <>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={!calculated || saving}>
                  <Save className="w-4 h-4" />
                  Simpan Distribusi
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Simpan Distribusi?</AlertDialogTitle>
                  <AlertDialogDescription>Data distribusi sebelumnya akan diganti dengan perhitungan baru.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSimpan}>Ya, Simpan</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" className="gap-2" onClick={handleExportPdf}>
              <FileText className="w-4 h-4" />
              Cetak PDF
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExportExcel}>
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </Button>
          </>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {calculated ? 'Hasil Perhitungan Distribusi' : savedData.length > 0 ? 'Data Distribusi Tersimpan' : 'Belum ada data distribusi'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {hasData ? (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Nama Mustahik</TableHead>
                      <TableHead>RT</TableHead>
                      <TableHead className="text-center">Tanggungan</TableHead>
                      <TableHead className="text-center">Total Jiwa</TableHead>
                      <TableHead className="text-right">Jatah Beras</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayData.map((d, i) => (
                      <TableRow key={d.mustahik_id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{d.nama}</TableCell>
                        <TableCell>{d.rt_nama}</TableCell>
                        <TableCell className="text-center">{d.jumlah_tanggungan}</TableCell>
                        <TableCell className="text-center font-semibold">{d.total_jiwa}</TableCell>
                        <TableCell className="text-right font-semibold">{d.jatah_beras} Liter</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3 p-4">
                {displayData.map((d, i) => (
                  <Card key={d.mustahik_id} className="border">
                    <CardContent className="p-3 space-y-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{i + 1}. {d.nama}</p>
                          <p className="text-xs text-muted-foreground">{d.rt_nama}</p>
                        </div>
                        <span className="text-sm font-bold text-primary">{d.jatah_beras} Liter</span>
                      </div>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>Tanggungan: {d.jumlah_tanggungan}</span>
                        <span>Total Jiwa: {d.total_jiwa}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <p>Klik "Hitung Pembagian Zakat" untuk menghitung distribusi otomatis.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
