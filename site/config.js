// Deployment configuration. Plain script (not a module) so the service worker can read it too.
//
// SITE_URL:         the app's home address; the old GitHub Pages copy shows a "we moved" banner pointing here.
// GOOGLE_CLIENT_ID: OAuth Web client id for the optional Google Drive sync (see README).
// REPO_URL:         the GitHub repository; "Report a problem" falls back to a prefilled issue there.
// REPORT_API:       endpoint of the report-api service (server/report-api) that files issues
//                   for users without a GitHub account; empty = use the prefilled-issue link only.
// VERSION:          written by the deploy workflow (git sha); "dev" locally.
self.TIB_CONFIG = {
  SITE_URL: 'https://tibetan.itjoy.space',
  GOOGLE_CLIENT_ID: '',
  REPO_URL: 'https://github.com/Kotstantin108/Kagyu-tibetan',
  REPORT_API: '',
  VERSION: 'dev',
};
