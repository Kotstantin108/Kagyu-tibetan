// Deployment configuration. Plain script (not a module) so the service worker can read it too.
//
// GOOGLE_CLIENT_ID: OAuth Web client id for the optional Google Drive sync (see README).
// REPO_URL:         where "Report a problem" links open a prefilled issue.
// VERSION:          written by the deploy workflow (git sha); "dev" locally.
self.TIB_CONFIG = {
  GOOGLE_CLIENT_ID: '',
  REPO_URL: 'https://github.com/Kotstantin108/Kagyu-tibetan',
  VERSION: 'dev',
};
