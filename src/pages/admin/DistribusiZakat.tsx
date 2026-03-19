import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Calculator, Save, FileText, FileSpreadsheet, Users, Package, Divide, Wallet } from 'lucide-react';
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

type DistribusiMode = 'beras' | 'uang' | 'gabungan';

interface DistribusiRow {
  mustahik_id: string;
  nama: string;
  kategori: string | null;
  rt_nama: string;
  jumlah_tanggungan: number;
  total_jiwa: number;
  jatah_beras: number;
  jatah_uang: number;
}

const modeLabels: Record<DistribusiMode, string> = {
  beras: 'Beras saja',
  uang: 'Uang saja',
  gabungan: 'Beras + Uang',
};

export default function DistribusiZakat() {
  const { user } = useAuth();
  const { stats, fetchStats } = useZakatStats();
  const [mustahikList, setMustahikList] = useState<MustahikItem[]>([]);
  const [distribusi, setDistribusi] = useState<DistribusiRow[]>([]);
  const [calculated, setCalculated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedData, setSavedData] = useState<any[]>([]);
  const [modeDistribusi, setModeDistribusi] = useState<DistribusiMode>('gabungan');

  const fmtCurrency = (value: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const showBeras = modeDistribusi === 'beras' || modeDistribusi === 'gabungan';
  const showUang = modeDistribusi === 'uang' || modeDistribusi === 'gabungan';

  const fetchData = async () => {
    const [{ data: mustahik }, _] = await Promise.all([
      supabase.from('mustahik').select('id, nama, jumlah_tanggungan, kategori, rt(nama_rt)'),
      fetchStats(),
    ]);
    setMustahikList(mustahik || []);

    const { data: existing } = await supabase
      .from('distribusi_zakat')
      .select('*, mustahik(nama, jumlah_tanggungan, kategori, rt(nama_rt))');
    setSavedData(existing || []);
  };

  useEffect(() => { fetchData(); }, []);

  const totalBerasZakat = stats.totalBeras;
  const totalUangZakat = stats.totalZakat;

  const totalJiwaMustahik = useMemo(() => {
    return mustahikList.reduce((sum, m) => sum + 1 + (m.jumlah_tanggungan || 0), 0);
  }, [mustahikList]);

  const jatahBerasPerJiwa = totalJiwaMustahik > 0 ? totalBerasZakat / totalJiwaMustahik : 0;
  const jatahUangPerJiwa = totalJiwaMustahik > 0 ? totalUangZakat / totalJiwaMustahik : 0;

  const handleHitung = () => {
    if (mustahikList.length === 0) {
      toast.error('Tidak ada data mustahik');
      return;
    }
    if (showBeras && totalBerasZakat <= 0) {
      toast.error('Total beras zakat masih 0');
      return;
    }
    if (showUang && totalUangZakat <= 0) {
      toast.error('Total uang zakat masih 0');
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
        jatah_beras: Math.round(totalJiwa * jatahBerasPerJiwa * 100) / 100,
        jatah_uang: Math.round(totalJiwa * jatahUangPerJiwa),
      };
    });

    rows.sort((a, b) => {
      if (showBeras && showUang) return b.total_jiwa - a.total_jiwa;
      if (showUang) return b.jatah_uang - a.jatah_uang;
      return b.jatah_beras - a.jatah_beras;
    });

    setDistribusi(rows);
    setCalculated(true);
    toast.success(`Perhitungan distribusi mode ${modeLabels[modeDistribusi].toLowerCase()} selesai ✓`);
  };

  const handleSimpan = async () => {
    if (!calculated || distribusi.length === 0) return;
    setSaving(true);
    try {
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

  const displayData: DistribusiRow[] = calculated
    ? distribusi
    : savedData.map((d) => ({
        mustahik_id: d.mustahik_id,
        nama: d.mustahik?.nama || '-',
        kategori: d.mustahik?.kategori || null,
        rt_nama: d.mustahik?.rt?.nama_rt || '-',
        jumlah_tanggungan: d.mustahik?.jumlah_tanggungan || 0,
        total_jiwa: d.total_jiwa,
        jatah_beras: Number(d.jatah_beras) || 0,
        jatah_uang: Math.round((Number(d.total_jiwa) || 0) * jatahUangPerJiwa),
      }));

  const hasData = displayData.length > 0;

  const buildExportHeaders = () => {
    const headers = ['No', 'Nama Mustahik', 'RT', 'Tanggungan', 'Total Jiwa'];
    if (showBeras) headers.push('Jatah Beras');
    if (showUang) headers.push('Jatah Uang');
    return headers;
  };

  const buildExportRows = () =>
    displayData.map((d, i) => {
      const row = [
        String(i + 1),
        d.nama,
        d.rt_nama,
        String(d.jumlah_tanggungan),
        String(d.total_jiwa),
      ];
      if (showBeras) row.push(`${d.jatah_beras} Liter`);
      if (showUang) row.push(fmtCurrency(d.jatah_uang));
      return row;
    });

  const buildExportSubtitle = () => {
    const parts = [
      `Mode: ${modeLabels[modeDistribusi]}`,
      `Total Jiwa: ${totalJiwaMustahik}`,
    ];
    if (showBeras) {
      parts.push(`Total Beras: ${totalBerasZakat} Liter`);
      parts.push(`Jatah Beras/Jiwa: ${jatahBerasPerJiwa.toFixed(2)} Liter`);
    }
    if (showUang) {
      parts.push(`Total Uang: ${fmtCurrency(totalUangZakat)}`);
      parts.push(`Jatah Uang/Jiwa: ${fmtCurrency(jatahUangPerJiwa)}`);
    }
    parts.push(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`);
    return parts.join(' | ');
  };

  const handleExportPdf = () => {
    exportPdf({
      title: 'Laporan Distribusi Zakat',
      subtitle: buildExportSubtitle(),
      headers: buildExportHeaders(),
      rows: buildExportRows(),
      filename: `distribusi-zakat-${modeDistribusi}-${new Date().toISOString().split('T')[0]}.pdf`,
    });
  };

  const handleExportExcel = () => {
    const header = `${buildExportHeaders().join('\t')}\n`;
    const body = buildExportRows().map((row) => row.join('\t')).join('\n');

    const footerLines = [`Mode Distribusi\t${modeLabels[modeDistribusi]}`, `Total Jiwa Mustahik\t${totalJiwaMustahik}`];
    if (showBeras) {
      footerLines.push(`Total Beras Zakat\t${totalBerasZakat} Liter`);
      footerLines.push(`Jatah Beras per Jiwa\t${jatahBerasPerJiwa.toFixed(2)} Liter`);
    }
    if (showUang) {
      footerLines.push(`Total Uang Zakat\t${fmtCurrency(totalUangZakat)}`);
      footerLines.push(`Jatah Uang per Jiwa\t${fmtCurrency(jatahUangPerJiwa)}`);
    }

    const footer = `\n\n${footerLines.join('\n')}`;
    const blob = new Blob([header + body + footer], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `distribusi-zakat-${modeDistribusi}-${new Date().toISOString().split('T')[0]}.xls`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Excel berhasil diunduh ✓');
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-xl md:text-2xl font-serif font-bold">Distribusi Zakat Otomatis</h1>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium">Mode Distribusi</p>
              <p className="text-xs text-muted-foreground">Pilih jenis distribusi yang ingin ditampilkan dan dihitung.</p>
            </div>
            <RadioGroup
              value={modeDistribusi}
              onValueChange={(value) => setModeDistribusi(value as DistribusiMode)}
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <div className="flex items-center space-x-2 rounded-md border p-3">
                <RadioGroupItem value="beras" id="mode-beras" />
                <Label htmlFor="mode-beras" className="cursor-pointer">Beras saja</Label>
              </div>
              <div className="flex items-center space-x-2 rounded-md border p-3">
                <RadioGroupItem value="uang" id="mode-uang" />
                <Label htmlFor="mode-uang" className="cursor-pointer">Uang saja</Label>
              </div>
              <div className="flex items-center space-x-2 rounded-md border p-3">
                <RadioGroupItem value="gabungan" id="mode-gabungan" />
                <Label htmlFor="mode-gabungan" className="cursor-pointer">Beras + Uang</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <div className={`grid grid-cols-1 gap-4 mb-6 ${showBeras && showUang ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
        {showBeras && (
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
        )}
        {showUang && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Uang Zakat</p>
                <p className="text-lg font-bold break-words">{fmtCurrency(totalUangZakat)}</p>
              </div>
            </CardContent>
          </Card>
        )}
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
        {showBeras && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Divide className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Jatah Beras per Jiwa</p>
                <p className="text-lg font-bold">{jatahBerasPerJiwa.toFixed(2)} Liter</p>
              </div>
            </CardContent>
          </Card>
        )}
        {showUang && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Divide className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Jatah Uang per Jiwa</p>
                <p className="text-lg font-bold break-words">{fmtCurrency(jatahUangPerJiwa)}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {calculated ? 'Hasil Perhitungan Distribusi' : savedData.length > 0 ? 'Data Distribusi Tersimpan' : 'Belum ada data distribusi'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {hasData ? (
            <>
              <div className="hidden md:block overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Nama Mustahik</TableHead>
                      <TableHead>RT</TableHead>
                      <TableHead className="text-center">Tanggungan</TableHead>
                      <TableHead className="text-center">Total Jiwa</TableHead>
                      {showBeras && <TableHead className="text-right">Jatah Beras</TableHead>}
                      {showUang && <TableHead className="text-right">Jatah Uang</TableHead>}
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
                        {showBeras && <TableCell className="text-right font-semibold">{d.jatah_beras} Liter</TableCell>}
                        {showUang && <TableCell className="text-right font-semibold">{fmtCurrency(d.jatah_uang)}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3 p-4">
                {displayData.map((d, i) => (
                  <Card key={d.mustahik_id} className="border">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold">{i + 1}. {d.nama}</p>
                          <p className="text-xs text-muted-foreground">{d.rt_nama}</p>
                        </div>
                        <div className="space-y-1 text-sm font-bold">
                          {showBeras && <p className="text-primary">{d.jatah_beras} Liter</p>}
                          {showUang && <p className="text-primary break-words">{fmtCurrency(d.jatah_uang)}</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
