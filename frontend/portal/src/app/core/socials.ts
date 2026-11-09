import { PublicPage } from './api.types';

export interface SocialLink {
  key: 'facebook' | 'instagram' | 'tiktok' | 'snapchat' | 'x';
  label: string;
  url: string;
  /** PrimeIcons class when there is one. */
  icon?: string;
  /** What to show without an icon (one letter). */
  short: string;
  /** The account as people know it, e.g. @clean.pro */
  handle: string;
}

/** The company's social accounts as links, in a fixed order. Only the ones the company filled in. */
export function socialLinks(p: PublicPage | undefined | null): SocialLink[] {
  if (!p) return [];
  const out: SocialLink[] = [];
  if (p.facebook) {
    const byId = /^\d+$/.test(p.facebook);
    out.push({
      key: 'facebook',
      label: 'Facebook',
      icon: 'pi-facebook',
      short: 'f',
      url: byId ? `https://www.facebook.com/profile.php?id=${p.facebook}` : `https://www.facebook.com/${p.facebook}`,
      handle: byId ? 'Facebook' : p.facebook,
    });
  }
  if (p.instagram) {
    out.push({ key: 'instagram', label: 'Instagram', icon: 'pi-instagram', short: 'IG', url: `https://instagram.com/${p.instagram}`, handle: `@${p.instagram}` });
  }
  if (p.tiktok) {
    out.push({ key: 'tiktok', label: 'TikTok', icon: 'pi-tiktok', short: 'T', url: `https://www.tiktok.com/@${p.tiktok}`, handle: `@${p.tiktok}` });
  }
  if (p.snapchat) {
    out.push({ key: 'snapchat', label: 'Snapchat', short: 'S', url: `https://www.snapchat.com/add/${p.snapchat}`, handle: p.snapchat });
  }
  if (p.x) {
    out.push({ key: 'x', label: 'X', short: 'X', url: `https://x.com/${p.x}`, handle: `@${p.x}` });
  }
  return out;
}
