# ⚛️ Atomic-UI

**Advanced Outline VPN Management Panel**

A modern, feature-rich web application for managing Outline VPN servers. Built with Next.js 14, TypeScript, and a beautiful atomic-inspired dark theme.


![New Note](https://github.com/user-attachments/assets/e3a543e6-165f-472b-a46b-462a15c96ed0)

## ✨ Features

### Server Management
- **Multi-Server Support**: Connect and manage multiple Outline servers from a single dashboard
- **Auto-Deployment**: Provision new DigitalOcean droplets directly from the UI
- **Real-time Health Monitoring**: Track server status, latency, and uptime
- **One-click Sync**: Synchronize keys and metrics from Outline servers

### Access Key Management
- **Advanced CRUD**: Create, read, update, and delete access keys with ease
- **Key Templates**: Define standard configurations (e.g. "30 Day Plan") for quick key creation
- **Bulk Operations**: Create, extend, or delete multiple keys at once
- **Traffic Limits**: Set data usage limits (GB) with auto-reset strategies (Daily/Weekly/Monthly)
- **Flexible Expiration**: Never, fixed date, duration from creation, or start-on-first-use
- **Sharing**: Auto-generated QR codes and subscription URLs (Dynamic Keys)

### User Portal & Self-Service
- **Client Portal**: Dedicated area for users to view their keys, usage stats, and subscription links
- **Dynamic Access Keys**: Single subscription URL that automatically updates with assigned keys
- **My Device**: Auto-detection of VPN connection status

### Analytics & Reporting
- **Traffic History**: Interactive charts showing usage trends (24h, 7d, 30d)
- **Top Users**: Identify high-bandwidth consumers
- **Peak Hours**: Heatmap visualization of network activity

### Security
- **Role-based Access**: Admin, staff, and viewer roles
- **Firewall Rules**: Geo-blocking and IP restriction for the dashboard
- **Secure Auth**: JWT authentication, bcrypt hashing, and session management

### Telegram Bot Integration
- **Notifications**: Receive admin alerts for expiry and high usage
- **Commands**: Check status, usage, and system info via Telegram
- **User Linking**: Link Telegram accounts to users for direct messaging

## 🚀 Quick Start

### 1. Installation
The recommended way to deploy is using Docker.

```bash
git clone https://github.com/sankahchan/atomic-ui.git
cd atomic-ui
cp .env.example .env
# Edit .env with your details
docker-compose up -d --build
```

Access the dashboard at `http://localhost:3000`.

**Default Credentials**:
Check the logs on first run for the generated admin credentials:
```bash
docker-compose logs atomic-ui | grep "Login Credentials" -A 2
```

See [DEPLOY.md](DEPLOY.md) for detailed production deployment instructions.

## 📁 Project Structure

```
atomic-ui/
├── prisma/             # Database schema
├── scripts/            # Setup and utility scripts
├── src/
│   ├── app/            # Next.js App Router pages
│   ├── components/     # UI Components (shadcn/ui)
│   ├── lib/            # Utilities (Auth, DB, Security)
│   ├── server/         # Backend Logic
│   │   ├── routers/    # tRPC API Routers
│   │   ├── scheduler.ts # Background Jobs (Cron)
│   └── types/          # TypeScript definitions
├── docker-compose.yml  # Docker configuration
└── Dockerfile          # Container definition
```

## 🔧 Configuration

Key environment variables in `.env`:

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret for signing session tokens (Required) |
| `APP_URL` | Public URL for subscription links (e.g. `https://vpn.example.com`) |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `DIGITALOCEAN_TOKEN` | (Optional) Token for auto-deployment feature |
| `DEFAULT_ADMIN_EMAIL` | Email for initial admin account |

## 🛠 Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Database**: SQLite (via Prisma)
- **API**: tRPC
- **Styling**: Tailwind CSS, shadcn/ui
- **Charts**: Recharts
- **Maps**: react-simple-maps (Server locations)

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines before submitting a PR.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Made with ⚛️ by [sankahchan](https://github.com/sankahchan)
