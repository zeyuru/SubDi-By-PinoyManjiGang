# Villa Purita Subdivision Management System
## Minglanilla, Cebu — Full Stack

### File Structure
```
villa_purita/
├── dashboard.html          ← Frontend (open in browser)
├── database.sql            ← MySQL schema — run this first
├── .htaccess               ← Apache rewrite rules
├── api/
│   └── index.php           ← API entry point (all routes)
├── config/
│   ├── database.php        ← PDO connection (env vars)
│   └── session.php         ← Session management
├── middleware/
│   └── auth.php            ← Role-based auth guard
├── helpers/
│   └── Response.php        ← JSON response helper
├── models/
│   ├── User.php
│   ├── Resident.php
│   ├── Visitor.php
│   ├── Dues.php
│   ├── Incident.php
│   └── Announcement.php
└── controllers/
    └── Controllers.php     ← All controllers (Auth, User, Resident, Visitor, Dues, Incident, Announcement)
```

### Setup Steps
1. **Database**: Run `database.sql` in MySQL/MariaDB
2. **Environment**: Set these variables (or edit config/database.php directly):
   - `DB_HOST=localhost`
   - `DB_NAME=villa_purita_db`
   - `DB_USER=your_user`
   - `DB_PASS=your_password`
   - `DB_PORT=3306`
3. **Web Server**: Apache/Nginx + PHP 8.1+
4. **Place files** at document root (e.g. `/var/www/html/villa_purita/`)
5. **Open** `dashboard.html` in your browser
6. **Login**: Create your admin password hash via:
   ```php
   echo password_hash('YourPassword', PASSWORD_BCRYPT);
   ```
   Then UPDATE users SET password_hash='...' WHERE username='admin';

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Current user |
| GET | /api/residents | List residents |
| GET | /api/residents/show?id= | Resident detail + payment history |
| GET | /api/residents/stats | Dashboard stats |
| POST | /api/residents | Add resident |
| DELETE | /api/residents?id= | Remove resident |
| GET | /api/visitors | All visitors |
| GET | /api/visitors/inside | Currently inside |
| GET | /api/visitors/summary | Today's summary |
| POST | /api/visitors/entry | Log visitor in |
| POST | /api/visitors/exit | Log visitor out |
| GET | /api/dues | All payment records |
| GET | /api/dues/summary | Monthly summary stats |
| POST | /api/dues/payment | Record payment |
| GET | /api/incidents | All incidents |
| POST | /api/incidents | Report incident |
| POST | /api/incidents/status | Update status |
| GET | /api/announcements | Active announcements |
| POST | /api/announcements | Post announcement |
| POST | /api/announcements/archive | Archive announcement |
| GET | /api/users | List users (admin only) |
| POST | /api/users | Create user (admin only) |
| POST | /api/users/status | Toggle status (admin only) |
| DELETE | /api/users?id= | Delete user (admin only) |

### Roles
- **Administrator** — Full access to all panels
- **Guard** — Visitors, Incidents, Guard Console
- **Homeowner** — Dashboard, Map, Announcements
