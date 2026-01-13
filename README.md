# ⚛️ Atomic-UI

**Advanced Outline VPN Management Panel**

A modern, feature-rich web application for managing Outline VPN servers. Built with Next.js 14, TypeScript, and a beautiful atomic-inspired dark theme.

![Atomic-UI Dashboard](https://via.placeholder.com/800x400?text=Atomic-UI+Dashboard)

## ✨ Features

### Server Management
- **Multi-Server Support**: Connect and manage multiple Outline servers from a single dashboard
- **Real-time Health Monitoring**: Track server status, latency, and uptime
- **Tag-based Organization**: Organize servers with customizable tags
- **One-click Sync**: Synchronize keys and metrics from Outline servers

### Access Key Management
- **Full CRUD Operations**: Create, read, update, and delete access keys
- **Traffic Limits**: Set data usage limits with real-time tracking
- **Flexible Expiration**: Never, fixed date, duration from creation, or start-on-first-use
- **QR Code Generation**: Easy sharing with auto-generated QR codes
- **Bulk Operations**: Create, delete, or extend multiple keys at once

### Dynamic Access Keys (DAK)
- **Self-Managed**: Automatic key creation/deletion based on demand
- **Manual Mode**: Admin-controlled key attachment
- **Server Pooling**: Tag-based server selection for load distribution

### Monitoring & Alerts
- **Health Checks**: Automated server availability monitoring
- **Notifications**: Telegram, email, and webhook notifications
- **Dashboard Analytics**: Traffic trends, usage statistics, and alerts

### User Experience
- **Modern UI**: Clean, responsive interface with dark/light themes
- **Role-based Access**: Admin, staff, and viewer roles
- **Session Management**: Secure JWT authentication with multi-device support
- **Myanmar Localization**: Ready for Burmese language support

## 🚀 Quick Start

### One-Command Installation (Recommended for VPS)

Install Atomic-UI with a single command on Ubuntu/Debian VPS:

```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
```

This will automatically:
- Install Node.js 20.x
- Clone the repository
- Install dependencies
- Configure environment with secure JWT secret
- Setup SQLite database
- Create admin user
- Build for production
- Create systemd service
- Configure firewall

After installation, you'll see your login URL and credentials.

### Management Commands

```bash
systemctl status atomic-ui    # Check status
systemctl restart atomic-ui   # Restart the panel
systemctl stop atomic-ui      # Stop the panel
journalctl -u atomic-ui -f    # View logs
```

### Manual Installation

#### Prerequisites

- Node.js 18+ or Docker
- npm or yarn

#### Steps

1. **Clone the repository**
```bash
git clone https://github.com/sankahchan/atomic-ui.git
cd atomic-ui
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your settings
```

4. **Initialize database**
```bash
npx prisma db push
npm run setup
```

5. **Start development server**
```bash
npm run dev
```

6. **Open in browser**
```
http://localhost:3000
```

**Default credentials**: `admin` / `admin123`

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t atomic-ui .
docker run -p 3000:3000 -v atomic-data:/app/data atomic-ui
```

## 📁 Project Structure

```
atomic-ui/
├── prisma/
│   └── schema.prisma       # Database schema
├── scripts/
│   ├── setup.ts            # Initial setup script
│   └── change-password.ts  # Password management
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (auth)/         # Authentication pages
│   │   ├── (dashboard)/    # Protected dashboard pages
│   │   └── api/            # API routes
│   ├── components/
│   │   ├── ui/             # Reusable UI components
│   │   ├── dashboard/      # Dashboard-specific components
│   │   └── providers/      # Context providers
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility libraries
│   │   ├── auth.ts         # Authentication utilities
│   │   ├── db.ts           # Database client
│   │   ├── outline-api.ts  # Outline VPN API client
│   │   └── utils.ts        # Helper functions
│   ├── server/
│   │   ├── routers/        # tRPC routers
│   │   └── trpc.ts         # tRPC configuration
│   ├── stores/             # Zustand state stores
│   └── types/              # TypeScript definitions
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | `file:./data/atomic-ui.db` |
| `JWT_SECRET` | Secret for JWT signing | (required) |
| `SESSION_EXPIRY_DAYS` | Session duration | `7` |
| `COOKIE_SECURE` | Force secure cookies (`true`/`false`) | `NODE_ENV === production` |
| `APP_URL` | Public URL for subscription links | `http://localhost:3000` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot for notifications | (optional) |
| `HEALTH_CHECK_ENABLED` | Enable health monitoring | `true` |
| `HEALTH_CHECK_INTERVAL_MINS` | Check interval in minutes | `5` |

### Adding an Outline Server

1. Navigate to **Dashboard → Servers → Add Server**
2. Paste the JSON configuration from Outline Manager:
   ```json
   {"apiUrl":"https://your-server:port/secret","certSha256":"..."}
   ```
3. Enter a display name and optional location
4. Click **Add Server**

### Creating Access Keys

1. Navigate to **Dashboard → Access Keys → Create Key**
2. Select a server
3. Configure:
   - Name and contact info
   - Data limit (optional)
   - Expiration type
4. Click **Create Key**
5. Share the QR code or access URL with the user

## 🛠 Development

### Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **API**: tRPC for type-safe APIs
- **Styling**: Tailwind CSS with shadcn/ui
- **State**: Zustand + React Query

### Commands

```bash
# Development
npm run dev           # Start dev server
npm run build         # Build for production
npm run start         # Start production server
npm run lint          # Run ESLint

# Database
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema changes
npm run db:studio     # Open Prisma Studio

# Utilities
npm run setup         # Initial setup
npm run password:change  # Change user password
```

### API Endpoints

The application uses tRPC for type-safe APIs. Key procedures:

| Namespace | Procedures |
|-----------|------------|
| `auth` | `login`, `logout`, `me`, `changePassword` |
| `servers` | `list`, `getById`, `create`, `update`, `delete`, `sync`, `testConnection` |
| `keys` | `list`, `getById`, `create`, `update`, `delete`, `generateQRCode`, `bulkCreate`, `bulkDelete` |
| `tags` | `list`, `create`, `update`, `delete` |
| `dashboard` | `stats`, `serverStatus`, `recentActivity` |
| `settings` | `getAll`, `update` |

## 🔒 Security

- **JWT Authentication**: Secure token-based auth with HTTP-only cookies
- **Password Hashing**: bcrypt with cost factor 12
- **Session Management**: Database-backed sessions with automatic expiry
- **Input Validation**: Zod schemas for all inputs
- **HTTPS Ready**: Designed for reverse proxy deployment

## 🌍 Deployment

### Recommended Setup

1. Use a reverse proxy (nginx/Caddy) for HTTPS
2. Set a strong `JWT_SECRET`
3. Configure proper `APP_URL` for subscription links
4. Enable health checks and notifications

### Example nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name vpn.example.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📝 Roadmap

- [ ] Client self-service portal
- [ ] Subscription link generation (Clash, Shadowrocket)
- [ ] Advanced analytics dashboard
- [ ] Full Burmese localization
- [ ] Payment integration (KBZPay, Wave)
- [ ] Telegram bot commands

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines before submitting a PR.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Outline VPN](https://getoutline.org/) - The underlying VPN technology
- [x-ui](https://github.com/alireza0/x-ui) - UI inspiration
- [OutlineAdmin](https://github.com/AmRo045/OutlineAdmin) - Multi-server management concepts
- [shadcn/ui](https://ui.shadcn.com/) - UI component library
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework

---

Made with ⚛️ by [sankahchan](https://github.com/sankahchan)
