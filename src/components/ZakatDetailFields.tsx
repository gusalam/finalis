import React, { memo, useCallback } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export type MetodePembayaran = 'beras' | 'uang';

export interface DetailForm {
  fitrah: { enabled: boolean; jumlah_jiwa: string; jumlah_uang: string; jumlah_beras: string; metode: MetodePembayaran; harga_beras_per_liter: string; nama_anggota_jiwa: string[] };
  mal: { enabled: boolean; jumlah_uang: string };
  infaq: { enabled: boolean; jumlah_uang: string };
  fidyah: {
    enabled: boolean;
    jumlah_uang: string;
    jumlah_beras: string;
    metode: MetodePembayaran;
    harga_makan_per_hari: string;
    jumlah_hari: string;
    beras_per_hari: string;
    input_manual: boolean;
  };
}

const LITER_PER_JIWA = 3.5;
const DEFAULT_FIDYAH_BERAS_PER_HARI = '0.7';

export const emptyDetail = (): DetailForm => ({
  fitrah: { enabled: false, jumlah_jiwa: '1', jumlah_uang: '', jumlah_beras: '', metode: 'beras', harga_beras_per_liter: '', nama_anggota_jiwa: [] },
  mal: { enabled: false, jumlah_uang: '' },
  infaq: { enabled: false, jumlah_uang: '' },
  fidyah: { enabled: false, jumlah_uang: '', jumlah_beras: '', metode: 'beras', harga_makan_per_hari: '', jumlah_hari: '1', beras_per_hari: DEFAULT_FIDYAH_BERAS_PER_HARI, input_manual: false },
});

interface Props {
  detail: DetailForm;
  onChange: (updater: (prev: DetailForm) => DetailForm) => void;
  idPrefix?: string;
}

const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n);
const formatDecimal = (n: number) => `${parseFloat(n.toFixed(2))}`;

const FitrahFields = memo(function FitrahFields({
  fitrah, onToggle, onFieldChange, onAnggotaChange, idPrefix,
}: {
  fitrah: DetailForm['fitrah'];
  onToggle: (v: boolean) => void;
  onFieldChange: (field: string, value: string) => void;
  onAnggotaChange: (index: number, value: string) => void;
  idPrefix: string;
}) {
  const jiwa = Number(fitrah.jumlah_jiwa) || 0;
  const totalLiter = jiwa * LITER_PER_JIWA;
  const harga = Number(fitrah.harga_beras_per_liter) || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox id={`${idPrefix}-fitrah`} checked={fitrah.enabled} onCheckedChange={v => onToggle(!!v)} />
        <Label htmlFor={`${idPrefix}-fitrah`} className="cursor-pointer font-medium">Zakat Fitrah</Label>
      </div>
      {fitrah.enabled && (
        <div className="ml-6 space-y-3">
          <div>
            <Label className="text-sm font-medium mb-2 block">Metode Pembayaran</Label>
            <RadioGroup value={fitrah.metode} onValueChange={v => onFieldChange('metode', v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="beras" id={`${idPrefix}-fitrah-metode-beras`} />
                <Label htmlFor={`${idPrefix}-fitrah-metode-beras`} className="cursor-pointer">Beras</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="uang" id={`${idPrefix}-fitrah-metode-uang`} />
                <Label htmlFor={`${idPrefix}-fitrah-metode-uang`} className="cursor-pointer">Uang</Label>
              </div>
            </RadioGroup>
          </div>
          <div>
            <Label>Harga Beras per Liter (Rp) <span className="text-destructive">*</span></Label>
            <Input type="number" inputMode="numeric" min="0" value={fitrah.harga_beras_per_liter} onChange={e => onFieldChange('harga_beras_per_liter', e.target.value)} placeholder="Contoh: 12000" />
          </div>
          <div>
            <Label>Jumlah Jiwa <span className="text-destructive">*</span></Label>
            <Input type="number" inputMode="numeric" min="1" value={fitrah.jumlah_jiwa} onChange={e => onFieldChange('jumlah_jiwa', e.target.value)} />
          </div>
          {fitrah.metode === 'uang' && (
            <div>
              <Label>Jumlah Uang (Rp) — otomatis dihitung</Label>
              <Input type="text" value={harga > 0 && jiwa > 0 ? `Rp ${fmt(jiwa * LITER_PER_JIWA * harga)}` : '—'} readOnly className="bg-muted cursor-not-allowed" />
            </div>
          )}
          {jiwa > 1 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Nama Anggota Jiwa</Label>
              <p className="text-xs text-muted-foreground">Nama Muzakki otomatis dihitung sebagai jiwa pertama</p>
              {Array.from({ length: jiwa - 1 }, (_, i) => (
                <div key={i}>
                  <Label className="text-xs text-muted-foreground">Nama Anggota Jiwa {i + 1}</Label>
                  <Input placeholder={`Nama anggota jiwa ${i + 1}`} value={fitrah.nama_anggota_jiwa[i] || ''} onChange={e => onAnggotaChange(i, e.target.value)} />
                </div>
              ))}
            </div>
          )}
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            {fitrah.metode === 'beras' ? (
              <>
                <p><strong>{jiwa}</strong> jiwa × 3,5 liter = <strong>{totalLiter}</strong> Liter Beras</p>
                {harga > 0 && <p>Nilai setara: {totalLiter} × Rp {fmt(harga)} = <strong>Rp {fmt(totalLiter * harga)}</strong></p>}
              </>
            ) : (
              <>
                {harga > 0 && jiwa > 0 ? (
                  <p><strong>{jiwa}</strong> jiwa × 3,5 liter × Rp {fmt(harga)}<br />= <strong>Rp {fmt(jiwa * LITER_PER_JIWA * harga)}</strong></p>
                ) : (
                  <p className="text-muted-foreground">Isi jumlah jiwa dan harga beras untuk melihat perhitungan</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const SimpleMoneyField = memo(function SimpleMoneyField({ id, label, enabled, value, onToggle, onValueChange }: { id: string; label: string; enabled: boolean; value: string; onToggle: (v: boolean) => void; onValueChange: (v: string) => void; }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox id={id} checked={enabled} onCheckedChange={v => onToggle(!!v)} />
        <Label htmlFor={id} className="cursor-pointer font-medium">{label}</Label>
      </div>
      {enabled && (
        <div className="ml-6">
          <Label>Jumlah Uang (Rp) <span className="text-destructive">*</span></Label>
          <Input type="number" inputMode="numeric" min="0" value={value} onChange={e => onValueChange(e.target.value)} placeholder="0" />
        </div>
      )}
    </div>
  );
});

const FidyahFields = memo(function FidyahFields({
  fidyah, onToggle, onFieldChange, idPrefix,
}: {
  fidyah: DetailForm['fidyah'];
  onToggle: (v: boolean) => void;
  onFieldChange: (field: keyof DetailForm['fidyah'], value: string | boolean) => void;
  idPrefix: string;
}) {
  const hargaMakan = Number(fidyah.harga_makan_per_hari) || 0;
  const jumlahHari = Number(fidyah.jumlah_hari) || 0;
  const berasPerHari = Number(fidyah.beras_per_hari) || 0;
  const totalUang = hargaMakan * jumlahHari;
  const totalBerasOtomatis = berasPerHari * jumlahHari;
  const jumlahBerasManual = Number(fidyah.jumlah_beras) || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox id={`${idPrefix}-fidyah`} checked={fidyah.enabled} onCheckedChange={v => onToggle(!!v)} />
        <Label htmlFor={`${idPrefix}-fidyah`} className="cursor-pointer font-medium">Fidyah</Label>
      </div>
      {fidyah.enabled && (
        <div className="ml-6 space-y-3">
          <div>
            <Label className="text-sm font-medium mb-2 block">Metode Pembayaran</Label>
            <RadioGroup value={fidyah.metode} onValueChange={v => onFieldChange('metode', v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="beras" id={`${idPrefix}-fidyah-metode-beras`} />
                <Label htmlFor={`${idPrefix}-fidyah-metode-beras`} className="cursor-pointer">Beras</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="uang" id={`${idPrefix}-fidyah-metode-uang`} />
                <Label htmlFor={`${idPrefix}-fidyah-metode-uang`} className="cursor-pointer">Uang</Label>
              </div>
            </RadioGroup>
          </div>

          {fidyah.metode === 'uang' ? (
            <>
              <div>
                <Label>Harga Makan per Hari (Rp) <span className="text-destructive">*</span></Label>
                <Input type="number" inputMode="numeric" min="1" value={fidyah.harga_makan_per_hari} onChange={e => onFieldChange('harga_makan_per_hari', e.target.value)} placeholder="Contoh: 45000" />
              </div>
              <div>
                <Label>Jumlah Hari <span className="text-destructive">*</span></Label>
                <Input type="number" inputMode="numeric" min="1" value={fidyah.jumlah_hari} onChange={e => onFieldChange('jumlah_hari', e.target.value)} placeholder="Contoh: 5" />
              </div>
              <div>
                <Label>Total Fidyah (Rp) — otomatis dihitung</Label>
                <Input type="text" value={hargaMakan > 0 && jumlahHari >= 1 ? `Rp ${fmt(totalUang)}` : '—'} readOnly className="bg-muted cursor-not-allowed" />
              </div>
              <div className="rounded-md bg-muted p-3 text-sm">
                {hargaMakan > 0 && jumlahHari >= 1 ? (
                  <p><strong>Rp {fmt(hargaMakan)}</strong> × <strong>{jumlahHari}</strong> hari = <strong>Rp {fmt(totalUang)}</strong></p>
                ) : (
                  <p className="text-muted-foreground">Isi harga makan per hari dan jumlah hari untuk melihat perhitungan</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center space-x-2">
                <Checkbox id={`${idPrefix}-fidyah-manual`} checked={fidyah.input_manual} onCheckedChange={v => onFieldChange('input_manual', !!v)} />
                <Label htmlFor={`${idPrefix}-fidyah-manual`} className="cursor-pointer">Input manual</Label>
              </div>

              {fidyah.input_manual ? (
                <div>
                  <Label>Jumlah Beras (Liter) <span className="text-destructive">*</span></Label>
                  <Input type="number" inputMode="decimal" min="0" step="0.1" value={fidyah.jumlah_beras} onChange={e => onFieldChange('jumlah_beras', e.target.value)} placeholder="Contoh: 3.5" />
                </div>
              ) : (
                <>
                  <div>
                    <Label>Beras per Hari (Liter) <span className="text-destructive">*</span></Label>
                    <Input type="number" inputMode="decimal" min="0.1" step="0.1" value={fidyah.beras_per_hari} onChange={e => onFieldChange('beras_per_hari', e.target.value)} placeholder="0.7" />
                  </div>
                  <div>
                    <Label>Jumlah Hari <span className="text-destructive">*</span></Label>
                    <Input type="number" inputMode="numeric" min="1" value={fidyah.jumlah_hari} onChange={e => onFieldChange('jumlah_hari', e.target.value)} placeholder="Contoh: 5" />
                  </div>
                  <div>
                    <Label>Total Beras (Liter) — otomatis dihitung</Label>
                    <Input type="text" value={berasPerHari > 0 && jumlahHari >= 1 ? `${formatDecimal(totalBerasOtomatis)} Liter` : '—'} readOnly className="bg-muted cursor-not-allowed" />
                  </div>
                </>
              )}

              <div className="rounded-md bg-muted p-3 text-sm">
                {fidyah.input_manual ? (
                  jumlahBerasManual > 0 ? (
                    <p>Input manual: <strong>{formatDecimal(jumlahBerasManual)} liter</strong></p>
                  ) : (
                    <p className="text-muted-foreground">Isi jumlah beras manual untuk fidyah beras</p>
                  )
                ) : berasPerHari > 0 && jumlahHari >= 1 ? (
                  <p><strong>{formatDecimal(berasPerHari)} liter</strong> × <strong>{jumlahHari}</strong> hari = <strong>{formatDecimal(totalBerasOtomatis)} liter</strong></p>
                ) : (
                  <p className="text-muted-foreground">Isi beras per hari dan jumlah hari untuk melihat perhitungan</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

function ZakatDetailFields({ detail, onChange, idPrefix = 'zdf' }: Props) {
  const toggleFitrah = useCallback((v: boolean) => { onChange(d => ({ ...d, fitrah: { ...d.fitrah, enabled: v } })); }, [onChange]);
  const updateFitrahField = useCallback((field: string, value: string) => {
    onChange(prev => {
      const updated = { ...prev, fitrah: { ...prev.fitrah, [field]: value } };
      if (field === 'jumlah_jiwa') {
        const newJiwa = Math.max(0, (Number(value) || 1) - 1);
        const currentNames = [...prev.fitrah.nama_anggota_jiwa];
        updated.fitrah.nama_anggota_jiwa = newJiwa > currentNames.length ? [...currentNames, ...Array(newJiwa - currentNames.length).fill('')] : currentNames.slice(0, newJiwa);
      }
      return updated;
    });
  }, [onChange]);
  const updateAnggotaJiwa = useCallback((index: number, value: string) => {
    onChange(prev => { const names = [...prev.fitrah.nama_anggota_jiwa]; names[index] = value; return { ...prev, fitrah: { ...prev.fitrah, nama_anggota_jiwa: names } }; });
  }, [onChange]);
  const toggleMal = useCallback((v: boolean) => { onChange(d => ({ ...d, mal: { ...d.mal, enabled: v } })); }, [onChange]);
  const updateMal = useCallback((v: string) => { onChange(d => ({ ...d, mal: { ...d.mal, jumlah_uang: v } })); }, [onChange]);
  const toggleInfaq = useCallback((v: boolean) => { onChange(d => ({ ...d, infaq: { ...d.infaq, enabled: v } })); }, [onChange]);
  const updateInfaq = useCallback((v: string) => { onChange(d => ({ ...d, infaq: { ...d.infaq, jumlah_uang: v } })); }, [onChange]);
  const toggleFidyah = useCallback((v: boolean) => { onChange(d => ({ ...d, fidyah: { ...d.fidyah, enabled: v } })); }, [onChange]);
  const updateFidyahField = useCallback((field: keyof DetailForm['fidyah'], value: string | boolean) => {
    onChange(prev => ({ ...prev, fidyah: { ...prev.fidyah, [field]: value } }));
  }, [onChange]);

  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold">Jenis Zakat</Label>
      <FitrahFields fitrah={detail.fitrah} onToggle={toggleFitrah} onFieldChange={updateFitrahField} onAnggotaChange={updateAnggotaJiwa} idPrefix={idPrefix} />
      <SimpleMoneyField id={`${idPrefix}-mal`} label="Zakat Mal" enabled={detail.mal.enabled} value={detail.mal.jumlah_uang} onToggle={toggleMal} onValueChange={updateMal} />
      <SimpleMoneyField id={`${idPrefix}-infaq`} label="Infaq" enabled={detail.infaq.enabled} value={detail.infaq.jumlah_uang} onToggle={toggleInfaq} onValueChange={updateInfaq} />
      <FidyahFields fidyah={detail.fidyah} onToggle={toggleFidyah} onFieldChange={updateFidyahField} idPrefix={idPrefix} />
    </div>
  );
}

export default memo(ZakatDetailFields);
