# Villa Purita — Homeowner PWA

A mobile-first Progressive Web App covering every homeowner-side function of
the Villa Purita system: dashboard, neighborhood map, pay dues (GCash / Maya /
Office), report incidents (with map pinning), announcements, visitor log, and
profile/account settings.

It talks to your **existing** backend — no new API, no new database, no
backend code changes required.

## Installation (2 minutes)

1. Unzip this folder so you have a `homeowner-pwa/` directory.
2. Copy that whole `homeowner-pwa/` folder into your project, **next to**
   your existing `api/` folder — i.e. it should sit at:

   ```
   villa_purita/
   ├── api/
   ├── controllers/
   ├── models/
   ├── index.html        (your existing admin/guard/homeowner dashboard)
   ├── app.js
   └── homeowner-pwa/     ← paste it here
       ├── index.html
       ├── app.js
       ├── styles.css
       ├── manifest.json
       ├── sw.js
       ├── icons/
       └── vendor/
   ```

3. That's it. Visit `https://yourdomain.com/villa_purita/homeowner-pwa/` (or
   the equivalent local path) and log in with any **Homeowner** account.

The PWA automatically figures out your API URL — it looks at its own folder
location and goes one level up to find `api/`. As long as `homeowner-pwa/`
sits next to your `api/` folder, you don't need to configure anything.

## Why same-folder placement matters

Your backend uses PHP session cookies (`SameSite=Strict`) for login. Cookies
scoped this way only work when the PWA and the API are served from the same
site — placing `homeowner-pwa/` inside your existing project (same domain,
same folder tree) means login "just works" with zero backend changes.

## Installing it as an app (PWA)

On a phone, open the homeowner-pwa URL in Chrome or Safari, then:
- **Android (Chrome):** tap the menu (⋮) → "Add to Home screen" / "Install app"
- **iPhone (Safari):** tap Share → "Add to Home Screen"

It will then behave like a native app: its own icon, full-screen (no browser
address bar), and works offline for viewing previously-loaded data.

## What works offline

- Dashboard, dues history, announcements, incidents, and visitor records are
  cached after the first successful load — you can still view them with no
  internet connection (a small "📡 Offline" badge appears in the top bar).
- Actions that change data — submitting a payment, reporting an incident,
  updating your profile, logging in — correctly require an internet
  connection and show a clear message if you're offline, rather than
  silently failing or getting lost.

## What's included, by homeowner feature

| Feature | Notes |
|---|---|
| Dashboard | Property info, pending dues banner, quick actions, mini map, announcement feed, payment history, recent visitors |
| Live Map | Full-screen map of your home, active incidents nearby, visitors currently inside |
| Pay My Dues | GCash QR + reference + proof upload, Maya QR + reference + proof upload, or HOA Office instructions. Shows admin rejection reasons if a past payment was declined. |
| Report Incident | Type, priority, block/lot, tap-to-pin exact location on the map, description — submits immediately to guards/admin |
| Announcements | Full list with category tags (General/Urgent/Event/Maintenance/Payment Reminder) |
| Visitors | All visitor records logged against your property, with in/out times and status |
| Profile / Account | View your linked property, update email, change password, log out |
| Forgot Password | Same flow as the main system — emails a new temporary password |

## Testing notes

This was tested end-to-end against a live PHP + MySQL instance of your
uploaded project (real login, real file upload for payment proof, real
incident creation, real profile update) — not just visually. Leaflet (the
map library) and the app's fonts are bundled locally inside `vendor/`, so the
app has no dependency on any external CDN and will work even on a server
with restricted outbound internet access.
