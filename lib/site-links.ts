import 'server-only';
import { spreadsheetLink } from './google-sheets-api';

const safeUrl = (value?: string) => value && /^https:\/\//.test(value) ? value : null;
export function publicSiteDetails() {
  return {
    owner: process.env.NEXT_PUBLIC_OWNER_NAME ?? 'Student submission',
    app: safeUrl(process.env.NEXT_PUBLIC_APP_URL),
    github: safeUrl(process.env.NEXT_PUBLIC_GITHUB_URL),
    telegram: safeUrl(process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL),
    sheets: spreadsheetLink(),
  };
}
