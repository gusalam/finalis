
CREATE TABLE public.distribusi_zakat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mustahik_id uuid NOT NULL REFERENCES public.mustahik(id) ON DELETE CASCADE,
  total_jiwa integer NOT NULL DEFAULT 1,
  jatah_beras numeric NOT NULL DEFAULT 0,
  tanggal_distribusi date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.distribusi_zakat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view distribusi_zakat" ON public.distribusi_zakat FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated can insert distribusi_zakat" ON public.distribusi_zakat FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can update distribusi_zakat" ON public.distribusi_zakat FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can delete distribusi_zakat" ON public.distribusi_zakat FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
