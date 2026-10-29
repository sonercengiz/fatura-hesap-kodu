/** Metnin ilk harfini Türkçe kurala göre büyütür (i → İ, ı → I); görünür etiketler ve bildirimler büyük harfle başlar */
export const cap = (s: string): string => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
