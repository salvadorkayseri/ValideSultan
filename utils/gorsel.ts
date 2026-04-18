type CloudinaryOptimizasyonSecenekleri = {
  width?: number;
  height?: number;
  kalite?: 'auto' | 'good' | 'eco' | 'low';
};

export const cloudinaryGorselUrlOptimizasyonu = (url: string, secenekler: CloudinaryOptimizasyonSecenekleri = {}) => {
  const temizUrl = String(url || '').trim();
  if (!temizUrl) return '';
  if (!/res\.cloudinary\.com/i.test(temizUrl) || !temizUrl.includes('/upload/')) return temizUrl;

  if (temizUrl.includes('/upload/f_auto') || temizUrl.includes('/upload/q_auto')) {
    return temizUrl;
  }

  const kaliteEtiketi = String(secenekler.kalite || 'good').trim().toLowerCase();
  const kalite = kaliteEtiketi === 'eco' || kaliteEtiketi === 'low' || kaliteEtiketi === 'auto' ? kaliteEtiketi : 'good';
  const donusumler: string[] = ['f_auto', `q_auto:${kalite}`, 'dpr_auto'];
  if (Number(secenekler.width) > 0) {
    donusumler.push(`w_${Math.round(Number(secenekler.width))}`);
  }
  if (Number(secenekler.height) > 0) {
    donusumler.push(`h_${Math.round(Number(secenekler.height))}`, 'c_fill');
  }

  return temizUrl.replace('/upload/', `/upload/${donusumler.join(',')}/`);
};
