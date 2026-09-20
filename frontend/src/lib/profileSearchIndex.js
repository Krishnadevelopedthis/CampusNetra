// Header search becomes contextual on My Profile / Settings: instead of
// querying the backend (there's no separate "profile data" API to search --
// this *is* the record), it filters this fixed list of the page's own
// sections and jumps to the matching one. Keep this in sync with the
// id="..." anchors actually present on Profile.jsx / Settings.jsx.
export const PROFILE_SEARCH_INDEX = [
  {
    label: 'Campus record',
    keywords: 'campus record institution department course class enrollment employee id',
    route: '/profile#campus-record',
  },
  {
    label: 'Profile details',
    keywords: 'name phone email address verify verification personal information',
    route: '/profile#profile-details',
  },
  {
    label: 'Appearance',
    keywords: 'theme dark light mode table density time format week starts reduce motion preferences',
    route: '/settings#appearance',
  },
  {
    label: 'Notifications',
    keywords: 'notifications in-app email preferences alerts',
    route: '/settings#notifications',
  },
  {
    label: 'Security',
    keywords: 'password security current new confirm sign-in history devices',
    route: '/settings#security',
  },
  {
    label: 'Your data',
    keywords: 'data privacy request a copy of your data export delete my account',
    route: '/settings#data-privacy',
  },
]

export function searchProfileIndex(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return PROFILE_SEARCH_INDEX.filter(
    (entry) => entry.label.toLowerCase().includes(q) || entry.keywords.includes(q),
  )
}
