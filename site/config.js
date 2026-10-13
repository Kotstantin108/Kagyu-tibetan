// Deployment configuration. Plain script (not a module) so the service worker can read it too.
//
// SITE_URL:         the app's home address; the old GitHub Pages copy shows a "we moved" banner pointing here.
// GOOGLE_CLIENT_ID: OAuth Web client id for the optional Google Drive sync (see README).
// REPO_URL:         the GitHub repository; "Report a problem" falls back to a prefilled issue there.
// REPORT_API:       endpoint of the report-api service (server/report-api) that files issues
//                   for users without a GitHub account; empty = use the prefilled-issue link only.
// SUPPORT:          donation details for the "Support the project" page (#/support);
//                   empty entries are hidden. paypal = a https://paypal.me/... link, sbp = phone number
//                   for the Russian fast-payment system, cardGe / cardRu = card numbers, ibanGe + bankGe +
//                   swiftGe = Georgian bank transfer, recipient = name on the account.
// VERSION:          written by the deploy workflow (git sha); "dev" locally.
self.TIB_CONFIG = {
  SITE_URL: 'https://tibetan.itjoy.space',
  GOOGLE_CLIENT_ID: '',
  REPO_URL: 'https://github.com/Kotstantin108/Kagyu-tibetan',
  REPORT_API: 'https://tibetan.itjoy.space/api/report',
  SUPPORT: {
    paypal: '',
    sbp: '+7 962 222-18-13',
    cardRu: '',
    ibanGe: 'GE40CD0360000030890752',
    bankGe: 'JSC Credo Bank, Georgia',
    swiftGe: '',
    cardGe: '',
    other: '',
    recipient: 'Konstantin Vazhenin',
  },
  VERSION: 'dev',
};
