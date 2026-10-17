# A to Z Hostinger VPS Deployment Guide for AWIK NET

> **Do not use this guide for the requested Hostinger Premium shared-hosting deployment.** It assumes an Ubuntu VPS, root/SSH access, Docker, PostgreSQL, and DNS changes. It also contains unsafe legacy upload/bootstrap instructions. No steps in this guide have been approved or verified; do not execute them for the current migration.

Congratulations on finishing the AWIK NET system! Since you are deploying to a Hostinger VPS (Ubuntu), here are the absolute "baby steps" to get your system live safely and correctly.

## Prerequisites Before Starting
1. You have purchased a VPS from Hostinger (Ubuntu 22.04 or 24.04).
2. You have a domain name (e.g., `awik.net`) and have pointed the **A Record** to your VPS IP address.
3. You have an SSH client to access your VPS (like PuTTY on Windows, or just `ssh` in terminal).

---

## Step 1: Connect to your VPS and Install Requirements

Open your terminal or PuTTY and SSH into your Hostinger server:
```bash
ssh root@YOUR_VPS_IP
```

Once inside, run this single command to install Docker and Docker Compose (which is all you need):
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install docker.io docker-compose -y
sudo systemctl enable --now docker
```

---

## Step 2: Upload Your Code to the Server

You need to copy your code from your Windows PC to the Hostinger server.

1. On your Windows machine, open a terminal in `C:\Users\Admin\Projects\dggash`.
2. First, remove the `node_modules` folders so the upload is fast. We will recreate them on the server. (Do not skip this!)
3. Copy the files using `scp` (Secure Copy):

```powershell
scp -r ./* root@YOUR_VPS_IP:/root/awiknet/
```
*(If it asks for a password, enter your Hostinger root password)*

---

## Step 3: Configure Your Environment Variables

On your Hostinger VPS terminal, go to your app folder:
```bash
cd /root/awiknet
```

Create a production `.env` file from the example:
```bash
cp .env.example .env
nano .env
```
Update these specific values inside the `.env` file:
- `NODE_ENV=production`
- `DATABASE_URL=postgresql://postgres:YOUR_SECRET_DB_PASSWORD@postgres:5432/awik_net?schema=public`
- `JWT_SECRET=generate_a_very_long_random_string_here`
- `FRONTEND_URL=https://awik.net`
- `CORS_ORIGIN=https://awik.net`

*(Press `CTRL+X`, then `Y`, then `ENTER` to save and exit nano)*

---

## Step 4: Build and Start the Application

We will use the provided Docker setup to launch the Database, API, and Frontend, plus Nginx for handling web traffic.

Run this command inside `/root/awiknet`:
```bash
docker-compose -f docker-compose.prod.yml up --build -d
```
*Wait a few minutes. This command will install Node.js modules, build the Next.js frontend, build the NestJS backend, and start the PostgreSQL database.*

---

## Step 5: Initialize the Database and Admin Account

Once the containers are running, you need to push the database schema and create the first admin user.

1. Apply the database structure:
```bash
docker-compose -f docker-compose.prod.yml exec api npx prisma db push
```

2. Seed the initial data (this creates the first Admin account):
```bash
docker-compose -f docker-compose.prod.yml exec api npm run seed
```

---

## Step 6: Setup SSL/HTTPS (Crucial for GPS & Security)

To make GPS work and secure your app, you must install an SSL certificate.

1. Install Certbot:
```bash
sudo apt install certbot python3-certbot-nginx -y
```

2. Run Certbot to get a free SSL certificate from Let's Encrypt:
```bash
sudo certbot --nginx -d awik.net
```
Follow the prompts (enter your email, agree to terms). Certbot will automatically configure Nginx for HTTPS!

---

## Step 7: Login and Go Live!

1. Open your browser and go to `https://awik.net`
2. Do not use any default administrator credential. A safe first-admin bootstrap for this VPS flow has not been verified.
3. Do not treat successful container startup as a production readiness or acceptance test.
4. WhatsApp scheduling and delivery have not been verified on this hosting target.

**This guide does not establish deployment readiness.**
