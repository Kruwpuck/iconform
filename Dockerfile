# ---- base ----
# Trend Micro Web Security Cloud re-signs every HTTPS connection made from the
# Docker VM (the Windows host itself is exempt, which is why curl works there
# and apk/npm fail here). Without its root CA every fetch dies with
# "certificate verify failed" / "TLS: server certificate not trusted".
FROM node:25-alpine AS base
COPY certs/tmws-root-ca.crt /usr/local/share/ca-certificates/tmws-root-ca.crt
RUN cat /usr/local/share/ca-certificates/tmws-root-ca.crt >> /etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/tmws-root-ca.crt

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npx esbuild prisma/seed.ts --bundle --platform=node --format=cjs --outfile=prisma/seed.cjs --external:@prisma/client --external:.prisma/client

# ---- run ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:$PATH"
# host TLS-intercepting AV/proxy breaks Prisma's checkpoint ping to binaries.prisma.sh at boot
ENV CHECKPOINT_DISABLE=1
# libreoffice-writer: DOCX→PDF; ttf-liberation: Arial-metric fonts for exact layout
# poppler-utils: pdftoppm renders preview pages for drag-to-position signatures
RUN apk add --no-cache openssl libreoffice-writer ttf-liberation fontconfig poppler-utils \
    && addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/prisma/seed.cjs ./prisma/seed.cjs
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin/ ./node_modules/.bin/
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/node_modules/.prisma \
    /app/node_modules/@prisma \
    /app/node_modules/prisma \
    /app/node_modules/.bin \
    /app/data
USER nextjs
EXPOSE 3000
# ponytail: migration-at-boot fine for single instance; split into migrate job if replicas appear
CMD ["sh", "-c", "prisma db push --accept-data-loss && node prisma/seed.cjs && node server.js"]
