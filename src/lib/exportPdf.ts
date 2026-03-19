import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import type { PdfSection } from '@/lib/reporting';

interface ExportPdfOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  filename: string;
  orientation?: 'portrait' | 'landscape';
  sections?: PdfSection[];
}

export function exportPdf({
  title,
  subtitle,
  headers,
  rows,
  filename,
  orientation = 'portrait',
  sections = [],
}: ExportPdfOptions) {
  try {
    const doc = new jsPDF({ orientation });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFontSize(16);
    doc.text(title, 14, 20);

    if (subtitle) {
      doc.setFontSize(10);
      doc.setTextColor(100);
      const subtitleLines = doc.splitTextToSize(subtitle, pageWidth - 28);
      doc.text(subtitleLines, 14, 28);
      doc.setTextColor(0);
    }

    const subtitleHeight = subtitle ? doc.splitTextToSize(subtitle, pageWidth - 28).length * 5 : 0;
    const startY = subtitle ? 28 + subtitleHeight + 6 : 28;

    autoTable(doc, {
      head: [headers],
      body: rows.length > 0 ? rows : [['Tidak ada data']],
      startY,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [39, 103, 73], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    let currentY = ((doc as any).lastAutoTable?.finalY ?? startY) + 10;

    sections.forEach((section) => {
      if (!section.lines.length) return;

      if (currentY > pageHeight - 30) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(section.title, 14, currentY);
      currentY += 6;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      section.lines.forEach((line) => {
        const wrapped = doc.splitTextToSize(`• ${line}`, pageWidth - 28);
        if (currentY + wrapped.length * 5 > pageHeight - 14) {
          doc.addPage();
          currentY = 20;
        }
        doc.text(wrapped, 14, currentY);
        currentY += wrapped.length * 5 + 1;
      });

      currentY += 4;
    });

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('PDF berhasil diunduh ✓');
  } catch (error) {
    console.error('Export PDF error:', error);
    toast.error('Gagal mengunduh PDF. Silakan coba lagi.');
  }
}
