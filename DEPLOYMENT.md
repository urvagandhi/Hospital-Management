# Deployment Information

## Server Details
- **IP Address:** `168.144.124.208`
- **Port:** `22`
- **User:** `root`
- **Domain:** `myMyMediVault.in`
- **OS:** Rocky Linux 9

## Migration: Moving MongoDB to Host (Rocky Linux 9)

Since we are moving MongoDB out of Docker to save resources and persist data natively, follow these steps on your server.

### 1. Create Swap Space (Mandatory for 1GB Droplet)
If you haven't already:
```bash
sudo dd if=/dev/zero of=/swapfile bs=1024 count=2097152
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. Install MongoDB 7.0 Community Edition
```bash
# Add MongoDB Repository
sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo <<EOF
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/9/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc
EOF

# Install MongoDB
sudo dnf install -y mongodb-org

# Start and Enable Service
sudo systemctl enable --now mongod
```

### 3. Configure Database and Users
Run `mongosh` to enter the MongoDB shell:
```javascript
// Create Admin User
use admin
db.createUser({
  user: "admin",
  pwd: "YourSecureAdminPassword",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" }, "readWriteAnyDatabase" ]
})

// Create Application Database and User
use hospital-management
db.createUser({
  user: "MyMediVault_user",
  pwd: "YourSecureAppPassword",
  roles: [ { role: "readWrite", db: "hospital-management" } ]
})
exit
```

### 4. Enable Authentication and Network Binding
Edit the config file:
```bash
sudo vi /etc/mongod.conf
```
Change `bindIp: 127.0.0.1` to `bindIp: 0.0.0.0` (or `127.0.0.1,172.17.0.1` if you know your docker gateway IP).
Add the security section:
```yaml
security:
  authorization: enabled
```
Restart MongoDB:
```bash
sudo systemctl restart mongod
```

### 5. Secure with Firewall (Rocky Linux 9)
```bash
# Allow Docker bridge to access MongoDB port
sudo firewall-cmd --permanent --new-zone=docker-access
sudo firewall-cmd --permanent --zone=docker-access --add-source=172.17.0.0/16
sudo firewall-cmd --permanent --zone=docker-access --add-port=27017/tcp
sudo firewall-cmd --reload
```

### 6. Update Application Environment
Update your `.env` file on the server:
```env
# MongoDB Connection String (Points to Host machine from Container)
MONGODB_URI=mongodb://MyMediVault_user:YourSecureAppPassword@host.docker.internal:27017/hospital-management?authSource=hospital-management
```

### 7. Deploy Updated Stack
```bash
docker compose down
# Ensure you have pulled the latest docker-compose.yml changes
docker compose up -d --build
```

## Verification Commands
- **Check MongoDB Status:** `sudo systemctl status mongod`
- **Test Backend Connection:** `docker compose logs backend`
- **Verify API Health:** `curl http://localhost/api/health` (via Nginx)

## Migration: Moving Redis to Host (Rocky Linux 9)

To save even more RAM and eliminate 3rd party dependencies (Upstash), move Redis to the host.

### 1. Install Redis
```bash
sudo dnf install -y redis
sudo systemctl enable --now redis
```

### 2. Configure Redis (Security & Network)
Edit the config:
```bash
sudo vi /etc/redis/redis.conf
```
*   **Bind**: Change `bind 127.0.0.1` to `bind 0.0.0.0`
*   **Protected Mode**: Ensure `protected-mode no` (since we use firewall).
*   **Password**: Find `requirepass` and set your password:
    ```text
    requirepass YourSecureRedisPassword
    ```
Restart Redis:
```bash
sudo systemctl restart redis
```

### 3. Secure with Firewall
```bash
# Allow Docker bridge to access Redis port
sudo firewall-cmd --permanent --zone=docker-access --add-port=6379/tcp
sudo firewall-cmd --reload
```

### 4. Update Application Environment
Update your `.env` on the server:
```env
# Redis URL (Points to Host machine)
REDIS_URL=redis://:YourSecureRedisPassword@host.docker.internal:6379
```

### 5. Deploy Updated Stack
```bash
git pull
docker compose down
docker compose up -d --build
```

---

## MongoDB Backup & Restore

### Setup (one-time)

Credentials file (root-only):
```bash
sudo tee /etc/mongo-backup.env > /dev/null <<'EOF'
MONGO_USER=admin
MONGO_PASSWORD=<your-admin-password>
MONGO_AUTH_DB=admin
BACKUP_DIR=/backup/mongodb
KEEP_DAYS=7
EOF
sudo chmod 600 /etc/mongo-backup.env
```

Backup script at `/usr/local/bin/mongo-backup.sh` — compresses with `--gzip`, retains 7 days, logs size + disk usage to `/var/log/mongo-backup.log`.

Crontab (runs as root, daily at 2 AM):

```cron
0 2 * * * /usr/local/bin/mongo-backup.sh >> /var/log/mongo-backup-cron.log 2>&1
```

Log rotation at `/etc/logrotate.d/mongo-backup` — 14-day history, compressed, copytruncate.

### Manual backup

```bash
sudo /usr/local/bin/mongo-backup.sh
ls /backup/mongodb/
```

### Restore — test (safe, into a temporary database)

```bash
source /etc/mongo-backup.env

mongorestore \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" \
  --authenticationDatabase "$MONGO_AUTH_DB" \
  --nsFrom="hospital-management.*" \
  --nsTo="hospital-management-restore-test.*" \
  --gzip \
  /backup/mongodb/backup-YYYY-MM-DD_HH-MM

# Verify counts
mongosh --username "$MONGO_USER" --password "$MONGO_PASSWORD" \
  --authenticationDatabase "$MONGO_AUTH_DB" --quiet \
  --eval "
    db = db.getSiblingDB('hospital-management-restore-test');
    print('hospitals:', db.hospitals.countDocuments());
    print('patients: ', db.patients.countDocuments());
    print('sessions: ', db.sessions.countDocuments());
    print('auditlogs:', db.auditlogs.countDocuments());
  "

# Drop test database when done
mongosh --username "$MONGO_USER" --password "$MONGO_PASSWORD" \
  --authenticationDatabase "$MONGO_AUTH_DB" --quiet \
  --eval "db.getSiblingDB('hospital-management-restore-test').dropDatabase()"
```

### Restore — production (EMERGENCY ONLY — overwrites live data)

```bash
source /etc/mongo-backup.env

# Stop the app first to prevent writes during restore
docker compose stop backend compression-service

mongorestore \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" \
  --authenticationDatabase "$MONGO_AUTH_DB" \
  --nsFrom="hospital-management.*" \
  --nsTo="hospital-management.*" \
  --drop \
  --gzip \
  /backup/mongodb/backup-YYYY-MM-DD_HH-MM

# Restart after restore
docker compose start backend compression-service
```

**IMPORTANT:** `--drop` deletes each collection before restoring it. Only run this in an actual data-loss emergency. Always test the restore first using the test method above.

### Key notes

- Backups are stored on the same 50 GB droplet disk. Copy to external storage (e.g. S3/Spaces) for true offsite redundancy.
- The correct restore path is the **backup root** (e.g. `backup-2026-05-09_08-49`), NOT the `hospital-management` subdirectory inside it.
- `--gzip` is required on both `mongodump` and `mongorestore` — omitting it causes all `.bson.gz` files to be silently skipped.
