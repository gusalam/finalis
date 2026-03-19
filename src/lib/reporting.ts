import * as XLSX from 'xlsx';

export type PdfSection = {
  title: string;
  lines: string[];
};

export const ZAKAT_JENIS_OPTIONS = ['all', 'Zakat Fitrah', 'Zakat Mal', 'Infaq', 'Fidyah'] as const;
export const STATUS_TRANSAKSI_OPTIONS = ['all', 'Sukses', 'Pending', 'Dibatalkan'] as const;
export const MUSTAHIK_TYPE_OPTIONS = ['all', 'RT', 'Jamaah'] as const;
export const KATEGORI_OPTIONS = ['Fakir', 'Miskin', 'Amil', 'Mualaf', 'Riqab', 'Gharimin', 'Fisabilillah', 'Ibnu Sabil'] as const;

export const formatCurrencyId = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export const formatNumberId = (value: number, digits = 2) =>
  new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);

export const formatDateId = (value?: string | Date) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('id-ID');
};

export const normalizeJenisZakat = (value?: string | null) => {
  if (value === 'Shodaqoh') return 'Infaq';
  return value || '-';
};

export const getFilteredDetailsByJenis = (details: any[] = [], jenisFilter = 'all') => {
  const normalizedFilter = normalizeJenisZakat(jenisFilter);
  return details.filter((detail) => normalizedFilter === 'all' || normalizeJenisZakat(detail?.jenis_zakat) === normalizedFilter);
};

export const transactionMatchesJenis = (transaction: any, jenisFilter = 'all') =>
  jenisFilter === 'all' || getFilteredDetailsByJenis(transaction?.detail_zakat || [], jenisFilter).length > 0;

export const getTransactionJenisLabels = (transaction: any, jenisFilter = 'all') => {
  const labels = Array.from(
    new Set(getFilteredDetailsByJenis(transaction?.detail_zakat || [], jenisFilter).map((detail) => normalizeJenisZakat(detail?.jenis_zakat))),
  );
  return labels.join(', ');
};

export const getTransactionTotalUang = (transaction: any, jenisFilter = 'all') =>
  getFilteredDetailsByJenis(transaction?.detail_zakat || [], jenisFilter).reduce(
    (sum, detail) => sum + (Number(detail?.jumlah_uang) || 0),
    0,
  );

export const getTransactionTotalBeras = (transaction: any, jenisFilter = 'all') =>
  getFilteredDetailsByJenis(transaction?.detail_zakat || [], jenisFilter).reduce(
    (sum, detail) => sum + (Number(detail?.jumlah_beras) || 0),
    0,
  );

export const getTransactionTotalJiwa = (transaction: any, jenisFilter = 'all') =>
  getFilteredDetailsByJenis(transaction?.detail_zakat || [], jenisFilter).reduce(
    (sum, detail) => sum + (Number(detail?.jumlah_jiwa) || 0),
    0,
  );

export const getMustahikTotalJiwa = (mustahik: any) => 1 + (Number(mustahik?.jumlah_tanggungan) || 0);

export const buildZakatGrandTotals = (transactions: any[], jenisFilter = 'all') => {
  const totals = {
    'Zakat Fitrah': { jiwa: 0, beras: 0, uang: 0 },
    'Zakat Mal': { jiwa: 0, beras: 0, uang: 0 },
    Infaq: { jiwa: 0, beras: 0, uang: 0 },
    Fidyah: { jiwa: 0, beras: 0, uang: 0 },
  };

  transactions.forEach((transaction) => {
    getFilteredDetailsByJenis(transaction?.detail_zakat || [], jenisFilter).forEach((detail) => {
      const jenis = normalizeJenisZakat(detail?.jenis_zakat) as keyof typeof totals;
      if (!totals[jenis]) return;
      totals[jenis].jiwa += Number(detail?.jumlah_jiwa) || 0;
      totals[jenis].beras += Number(detail?.jumlah_beras) || 0;
      totals[jenis].uang += Number(detail?.jumlah_uang) || 0;
    });
  });

  return totals;
};

export const buildGrandTotalLines = (summary: ReturnType<typeof buildZakatGrandTotals>, jenisFilter = 'all') => {
  const jenisList = jenisFilter === 'all' ? ['Zakat Fitrah', 'Zakat Mal', 'Infaq', 'Fidyah'] : [normalizeJenisZakat(jenisFilter)];

  return jenisList
    .map((jenis) => {
      const item = summary[jenis as keyof typeof summary];
      if (!item) return null;

      if (jenis === 'Zakat Fitrah') {
        return `${jenis}: Total Jiwa ${formatNumberId(item.jiwa, 0)} | Total Beras ${formatNumberId(item.beras)} Liter | Total Uang ${formatCurrencyId(item.uang)}`;
      }
      if (jenis === 'Zakat Mal') {
        return `${jenis}: Total Uang ${formatCurrencyId(item.uang)}`;
      }
      if (jenis === 'Infaq') {
        return `${jenis}: Total Uang ${formatCurrencyId(item.uang)}`;
      }
      return `${jenis}: Total Beras ${formatNumberId(item.beras)} Liter | Total Uang ${formatCurrencyId(item.uang)}`;
    })
    .filter((line): line is string => Boolean(line));
};

export const exportWorkbook = (
  filename: string,
  sheets: Array<{ name: string; rows: Array<Record<string, string | number>> }>,
) => {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const worksheet = sheet.rows.length
      ? XLSX.utils.json_to_sheet(sheet.rows)
      : XLSX.utils.aoa_to_sheet([['Tidak ada data']]);

    if (sheet.rows.length) {
      const columns = Object.keys(sheet.rows[0]).map((key) => ({
        wch: Math.min(
          Math.max(
            key.length,
            ...sheet.rows.map((row) => String(row[key] ?? '').length),
          ) + 2,
          40,
        ),
      }));
      worksheet['!cols'] = columns;
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  XLSX.writeFile(workbook, filename);
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const printHtmlReport = ({
  title,
  subtitle,
  headers,
  rows,
  sections = [],
  orientation = 'portrait',
}: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  sections?: PdfSection[];
  orientation?: 'portrait' | 'landscape';
}) => {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=800');
  if (!printWindow) return;

  const tableHeaders = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const tableRows = rows.length
    ? rows
        .map(
          (row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${headers.length}" style="text-align:center;">Tidak ada data</td></tr>`;

  const sectionHtml = sections
    .map(
      (section) => `
        <section class="section-block">
          <h3>${escapeHtml(section.title)}</h3>
          <ul>
            ${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
          </ul>
        </section>
      `,
    )
    .join('');

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4 ${orientation}; margin: 14mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
          .wrapper { padding: 8px; }
          h1 { margin: 0 0 8px; font-size: 22px; }
          .subtitle { margin: 0 0 16px; color: #4b5563; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; }
          .section-block { margin-top: 16px; }
          .section-block h3 { margin: 0 0 8px; font-size: 14px; }
          .section-block ul { margin: 0; padding-left: 18px; }
          .section-block li { margin-bottom: 4px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
          <table>
            <thead>
              <tr>${tableHeaders}</tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${sectionHtml}
        </div>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
};
