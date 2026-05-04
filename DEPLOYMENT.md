# Deployment Information

## Server Details
- **IP Address:** `168.144.124.208`
- **Port:** `22`
- **User:** `root`
- **Domain:** `mymedivault.in`
- **SSH Key Path:** `/home/urva/.ssh/id_ed25519` (Private) / `/home/urva/.ssh/id_ed25519.pub` (Public)

## Commands to Deploy
To deploy the application to your DigitalOcean droplet, you can use the following steps:

1. **SSH into the server:**
   ```bash
   ssh root@168.144.124.208
   ```

2. **Clone the repository (if not already there):**
   ```bash
   git clone <your-repo-url>
   cd Hospital-Management
   ```

3. **Copy the .env file:**
   (You will need to manually copy the contents of the `.env` I created to the server)

4. **Run Docker Compose:**
   ```bash
   docker-compose up -d --build
   ```

## Post-Deployment Checklist
- [ ] Add Cloudinary API keys to `.env`
- [ ] Add Brevo API keys to `.env`
- [ ] Add Firebase project details to `.env`
- [ ] Configure DNS for `mymedivault.in` to point to `168.144.124.208`
- [ ] Ensure Port 80 and 443 are open on the firewall

> [!WARNING]
> Your droplet has 1GB of RAM. This is very tight for running MongoDB, Redis, and three application services. 
> It is **strongly recommended** to create a swap file (e.g., 2GB) on the droplet to prevent out-of-memory (OOM) errors.
> 
> **To create a swap file on Ubuntu/Debian:**
> ```bash
> sudo fallocate -l 2G /swapfile
> sudo chmod 600 /swapfile
> sudo mkswap /swapfile
> sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```
