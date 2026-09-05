FROM oven/bun:1.3.11-alpine

WORKDIR /app

# Sharp needs a real font for the build-time OCR smoke image.
RUN apk add --no-cache fontconfig ttf-dejavu

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build
# Bake Thai/English OCR data into the image so the first slip after a cold start
# never waits for a language-pack download.
RUN bun run ocr:smoke

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PROTOCOL_HEADER=x-forwarded-proto
ENV HOST_HEADER=x-forwarded-host

EXPOSE 3000
CMD ["bun", "run", "start"]
