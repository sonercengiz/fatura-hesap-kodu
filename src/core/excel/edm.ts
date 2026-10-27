/** EDM "Gelen Faturalar" Excel'inin sütun düzeni (A–T). GMS.NET'e verilen dosya bu başlıkları aynen taşır. */
export const EDM_HEADERS = [
  'Fatura No',
  'Fatura Tarihi',
  'Geliş Zamanı',
  'Fatura Tipi',
  'Fatura Türü',
  'Gönderen VKN/TCKN',
  'Gönderen Unvan/Ad Soyad',
  'Tutar',
  'Döviz Cinsi',
  'Durum',
  'Yanıt Durumu',
  'Yerele Aktarım Durumu',
  'Zarf No',
  'KEP İtiraz Durumu',
  'Gib Portal Fatura Iptal Durumu',
  'Resmi Yazı İtiraz Durumu',
  'Gib Portal Fatura İtiraz Durumu',
  'Şube',
  'Hash',
  'Etiket',
] as const;

export const EDM_SHEET_NAME = 'Sheet0';
