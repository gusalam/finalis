ALTER TABLE public.transaksi_zakat
ADD COLUMN IF NOT EXISTS status_transaksi text NOT NULL DEFAULT 'Sukses';

CREATE INDEX IF NOT EXISTS idx_transaksi_zakat_status_transaksi
ON public.transaksi_zakat(status_transaksi);