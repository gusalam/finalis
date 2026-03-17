import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { friendlyError } from '@/lib/errorHandler';

const KATEGORI_OPTIONS = ['Fakir', 'Miskin', 'Amil', 'Mualaf', 'Riqab', 'Gharimin', 'Fisabilillah', 'Ibnu Sabil'];

interface ImportRow {
  nama: string;
  alamat: string;
  kategori: string;
  jumlah_tanggungan: number;
  error?: string;
}

interface Props {
  createdBy?: string;
  onImportDone: () => void;
}

export default function ImportMustahik({ createdBy, onImportDone }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const csv = 'nama,alamat,kategori,jumlah_tanggungan\nAhmad,Jl Pepaya,Fakir,3\nBudi,Jl Mangga,Miskin,2\nHasan,Jl Jeruk,Gharimin,1\n';
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

  const parseFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let parsed: ImportRow[] = [];

    if (ext === 'csv') {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast.error('File CSV kosong atau tidak valid'); return; }
      // Skip header
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        parsed.push(validateRow(cols[0] || '', cols[1] || '', cols[2] || '', cols[3] || '', i + 1));
      }
    } else if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
      json.forEach((row: any, i: number) => {
        parsed.push(validateRow(
          String(row.nama || ''),
          String(row.alamat || ''),
          String(row.kategori || ''),
          String(row.jumlah_tanggungan || '0'),
          i + 2
        ));
      });
    } else {
      toast.error('Format file tidak didukung. Gunakan .csv atau .xlsx');
      return;
    }

    setRows(parsed);
    setOpen(true);
  };

  const validateRow = (nama: string, alamat: string, kategori: string, tanggunganStr: string, lineNum: number): ImportRow => {
    const errors: string[] = [];
    if (!nama.trim()) errors.push('Nama kosong');
    if (kategori && !KATEGORI_OPTIONS.includes(kategori)) errors.push(`Kategori "${kategori}" tidak valid`);
    const tanggungan = parseInt(tanggunganStr, 10);
    if (isNaN(tanggungan) || tanggungan < 0) errors.push('Jumlah tanggungan tidak valid');

    return {
      nama: nama.trim(),
      alamat: alamat.trim(),
      kategori: kategori.trim(),
      jumlah_tanggungan: isNaN(tanggungan) ? 0 : Math.max(0, tanggungan),
      error: errors.length > 0 ? `Baris ke-${lineNum}: ${errors.join(', ')}` : undefined,
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasErrors = rows.some(r => r.error);
  const validRows = rows.filter(r => !r.error);

  const handleImport = async () => {
    if (validRows.length === 0) { toast.error('Tidak ada data valid untuk diimport'); return; }
    setImporting(true);
    try {
      const payload = validRows.map(r => ({
        nama: r.nama,
        alamat: r.alamat || null,
        kategori: r.kategori || null,
        jumlah_tanggungan: r.jumlah_tanggungan,
        ...(createdBy ? { created_by: createdBy } : {}),
      }));
      const { error } = await supabase.from('mustahik').insert(payload);
      if (error) { toast.error(friendlyError(error)); return; }
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
        <Download className="w-4 h-4 mr-1" />Template
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        <Upload className="w-4 h-4 mr-1" />Import
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
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
                {rows.filter(r => r.error).map((r, i) => <p key={i}>{r.error}</p>)}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Tanggungan</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i} className={r.error ? 'bg-destructive/5' : ''}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{r.nama || <span className="text-destructive italic">kosong</span>}</TableCell>
                    <TableCell>{r.alamat || '-'}</TableCell>
                    <TableCell>{r.kategori || '-'}</TableCell>
                    <TableCell>{r.jumlah_tanggungan}</TableCell>
                    <TableCell>
                      {r.error ? <AlertCircle className="w-4 h-4 text-destructive" /> : <CheckCircle2 className="w-4 h-4 text-primary" />}
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
