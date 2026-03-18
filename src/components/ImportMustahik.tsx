import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { friendlyError } from '@/lib/errorHandler';

const KATEGORI_OPTIONS = ['Fakir', 'Miskin', 'Amil', 'Mualaf', 'Riqab', 'Gharimin', 'Fisabilillah', 'Ibnu Sabil'];
const STATUS_OPTIONS = ['RT', 'Jamaah'];

interface ImportRow {
  nama: string;
  alamat: string;
  status_penerima: string;
  rt: string;
  rt_id: string;
  kategori: string;
  jumlah_tanggungan: number;
  error?: string;
}

interface RtOption {
  id: string;
  nama_rt: string;
}

interface Props {
  createdBy?: string;
  onImportDone: () => void;
}

const normalizeValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const findCanonicalValue = (value: string, options: string[]) => {
  const normalized = normalizeValue(value);
  return options.find(option => normalizeValue(option) === normalized) || '';
};

const formatCsvCell = (value: string) => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export default function ImportMustahik({ createdBy, onImportDone }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [rtList, setRtList] = useState<RtOption[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchRt = async () => {
      const { data, error } = await supabase.from('rt').select('id, nama_rt').order('nama_rt');
      if (error) {
        toast.error(friendlyError(error));
        return;
      }
      setRtList((data || []) as RtOption[]);
    };

    fetchRt();
  }, []);

  const findRt = (value: string) => {
    const normalized = normalizeValue(value);
    return rtList.find(rt => normalizeValue(rt.nama_rt) === normalized) || null;
  };

  const downloadTemplate = () => {
    const rows = [
      ['nama', 'alamat', 'status_penerima', 'rt', 'kategori', 'jumlah_tanggungan'],
      ['Ahmad', 'Jl Pepaya', 'RT', 'RT 01', 'Fakir', '3'],
      ['Budi', 'Jl Mangga', 'RT', 'RT 02', 'Miskin', '2'],
      ['Hasan', 'Jl Jeruk', 'RT', 'RT 03', 'Gharimin', '1'],
    ];
    const csv = `${rows.map(row => row.map(formatCsvCell).join(',')).join('\n')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_mustahik.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const validateRow = (
    nama: string,
    alamat: string,
    statusPenerima: string,
    rtName: string,
    kategori: string,
    tanggunganStr: string,
    lineNum: number,
  ): ImportRow => {
    const errors: string[] = [];
    const normalizedNama = nama.trim();
    const normalizedAlamat = alamat.trim();
    const canonicalStatus = findCanonicalValue(statusPenerima, STATUS_OPTIONS);
    const canonicalKategori = findCanonicalValue(kategori, KATEGORI_OPTIONS);
    const matchedRt = findRt(rtName);
    const tanggungan = Number.parseInt(String(tanggunganStr).trim(), 10);

    if (!normalizedNama) errors.push('Nama wajib diisi');
    if (!statusPenerima.trim()) errors.push('Status penerima wajib diisi');
    else if (!canonicalStatus) errors.push(`Status penerima "${statusPenerima}" tidak valid`);
    if (!rtName.trim()) errors.push('RT wajib diisi');
    else if (!matchedRt) errors.push(`RT "${rtName}" tidak sesuai data sistem`);
    if (kategori.trim() && !canonicalKategori) errors.push(`Kategori "${kategori}" tidak valid`);
    if (Number.isNaN(tanggungan) || tanggungan < 0) errors.push('Jumlah tanggungan harus angka ≥ 0');

    return {
      nama: normalizedNama,
      alamat: normalizedAlamat,
      status_penerima: canonicalStatus || statusPenerima.trim(),
      rt: matchedRt?.nama_rt || rtName.trim(),
      rt_id: matchedRt?.id || '',
      kategori: canonicalKategori || kategori.trim(),
      jumlah_tanggungan: Number.isNaN(tanggungan) ? 0 : Math.max(0, tanggungan),
      error: errors.length > 0 ? `Baris ke-${lineNum}: ${errors.join(', ')}` : undefined,
    };
  };

  const parseFile = async (file: File) => {
    if (rtList.length === 0) {
      toast.error('Data RT belum siap, silakan coba lagi.');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    const parsed: ImportRow[] = [];

    if (ext === 'csv') {
      const text = await file.text();
      const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length < 2) { toast.error('File CSV kosong atau tidak valid'); return; }
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(col => col.trim());
        parsed.push(validateRow(cols[0] || '', cols[1] || '', cols[2] || '', cols[3] || '', cols[4] || '', cols[5] || '', i + 1));
      }
    } else if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      json.forEach((row, i) => {
        parsed.push(validateRow(
          String(row.nama || ''),
          String(row.alamat || ''),
          String(row.status_penerima || row.status || ''),
          String(row.rt || row.nama_rt || ''),
          String(row.kategori || ''),
          String(row.jumlah_tanggungan || '0'),
          i + 2,
        ));
      });
    } else {
      toast.error('Format file tidak didukung. Gunakan .csv atau .xlsx');
      return;
    }

    setRows(parsed);
    setOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasErrors = rows.some(row => row.error);
  const validRows = rows.filter(row => !row.error);

  const handleImport = async () => {
    if (validRows.length === 0) { toast.error('Tidak ada data valid untuk diimport'); return; }

    setImporting(true);
    try {
      const payload = validRows.map(row => ({
        nama: row.nama,
        alamat: row.alamat || null,
        status: row.status_penerima,
        rt_id: row.rt_id,
        kategori: row.kategori || null,
        jumlah_tanggungan: row.jumlah_tanggungan,
        ...(createdBy ? { created_by: createdBy } : {}),
      }));

      const { error } = await supabase.from('mustahik').insert(payload);
      if (error) {
        toast.error(friendlyError(error));
        return;
      }

      toast.success(`Berhasil import ${validRows.length} data mustahik`);
      setOpen(false);
      setRows([]);
      onImportDone();
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
      <Button variant="outline" size="sm" onClick={downloadTemplate}>
        <Download className="w-4 h-4 mr-1" />Download Template
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        <Upload className="w-4 h-4 mr-1" />Import Mustahik
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Preview Import Mustahik</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-primary"><CheckCircle2 className="w-4 h-4" />{validRows.length} data valid</span>
              {hasErrors && <span className="flex items-center gap-1 text-destructive"><AlertCircle className="w-4 h-4" />{rows.length - validRows.length} error</span>}
            </div>

            {hasErrors && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive space-y-1">
                {rows.filter(row => row.error).map((row, index) => <p key={index}>{row.error}</p>)}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead>Status Penerima</TableHead>
                  <TableHead>RT</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Tanggungan</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index} className={row.error ? 'bg-destructive/5' : ''}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{row.nama || <span className="text-destructive italic">kosong</span>}</TableCell>
                    <TableCell>{row.alamat || '-'}</TableCell>
                    <TableCell>{row.status_penerima || '-'}</TableCell>
                    <TableCell>{row.rt || '-'}</TableCell>
                    <TableCell>{row.kategori || '-'}</TableCell>
                    <TableCell>{row.jumlah_tanggungan}</TableCell>
                    <TableCell>
                      {row.error ? <AlertCircle className="w-4 h-4 text-destructive" /> : <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setOpen(false); setRows([]); }}>Batal</Button>
              <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
                <Upload className="w-4 h-4 mr-1" />{importing ? 'Mengimport...' : `Import ${validRows.length} Data`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
