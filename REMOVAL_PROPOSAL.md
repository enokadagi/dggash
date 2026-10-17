# Removal Proposal

This document lists files and subsystems that are candidates for removal or exclusion once a Hostinger-targeted PHP/MariaDB architecture is selected. This is a proposal only and no deletions were performed during this task.

## Cloudflare / CDN / reverse-proxy only
- Any Cloudflare-specific configuration or rules not required by Hostinger shared hosting
- Traffic or edge logic that assumes a CDN-managed reverse proxy
Role: deployment acceleration only; dependencies: public DNS and edge configuration

## Docker / VPS / local dev only
- docker-compose.yml
- docker-compose.dev.yml
- docker-compose.prod.yml
- nginx/nginx.conf
- nginx/conf.d/default.conf
- apps/api/Dockerfile
- apps/web/Dockerfile
Role: local developer runtime and proxying; dependencies: Docker or an external VPS stack

## PostgreSQL-only reference files
- packages/database/prisma/schema.prisma
- packages/database/prisma/migrations/**
- packages/database/prisma/seed.js
- any Prisma PostgreSQL provider configuration used only for the original NestJS app
Role: reference implementation and migration source; dependencies: original NestJS runtime

## Duplicate or staging package artifacts
- deployment/hostinger-upload/**
- apps/web/out/**
- apps/web/.next/**
Role: static export and packaging output; dependencies: build process and serving assets from a host document root

## Generated or build-only files to keep out of final deployment
- tsbuildinfo outputs
- generated Next.js output folders
- any local cache or compiled artifacts that are not required by the final upload
Role: developer convenience; dependencies: Node.js compile step

## Required decision before actual removal
The final Hostinger design must be selected before any of these are removed. The current repository still contains both the original NestJS/PostgreSQL source and the partial PHP/MariaDB prototype; both should stay in place as reference until the migration is validated.
