# Implementation Plan: 12 New Features

## Database Schema Changes (prisma/schema.prisma)

### New Models:
1. **ApiToken** - For feature #4 (External API access)
2. **Report** - For feature #3 (Monthly usage reports)
3. **KeyRotationSchedule** - For feature #6 (Key auto-rotation)

### Modified Models:
- **AccessKey** - Add `bandwidthAlertSent80`, `bandwidthAlertSent90`, `autoDisableOnLimit` fields (#1)
- **Settings** - Store status page config, load balancing preferences

## Features Breakdown

### 1. Bandwidth Alerts & Auto-Disable
- Add fields to AccessKey for alert tracking
- Add bandwidth check job in scheduler
- Send Telegram notifications at 80%/90%
- Auto-disable key at 100%

### 2. Smart Server Load Balancing
- New procedure in dynamic-keys router
- Algorithm: pick server with lowest bandwidth usage ratio
- Applied when creating/attaching keys to dynamic keys

### 3. Monthly Usage Reports
- New Report model + router
- Generate CSV export of traffic per server/key
- API route to download reports

### 4. API Tokens for External Access
- New ApiToken model + router
- Bearer token auth middleware
- REST API endpoints for key CRUD

### 5. Client Self-Service Portal Enhancement
- Enhance /portal page
- Add usage graphs, extend key, regenerate subscription link

### 6. Key Auto-Rotation
- New rotation schedule model
- Background job to rotate keys on schedule
- Keep subscription URL stable

### 7. Server Migration Tool
- New procedure to migrate keys between servers
- Bulk move with progress tracking

### 8. Bulk Operations
- Add bulk select to keys list
- Bulk extend, disable, delete, move

### 9. Uptime Status Page
- Public /status page
- Show server health with uptime bars

### 11. Dark Mode for Subscription Pages
- Add theme support to /sub/[token] page

### 12. Export/Import Servers
- Export server config as JSON
- Import server from JSON

### 13. Key Usage Sparklines
- Tiny 7-day traffic charts inline on keys list
