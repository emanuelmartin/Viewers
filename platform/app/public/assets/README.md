# Assets de pixOS Web

Este directorio contiene los logos y recursos visuales de la aplicación web.

## 📁 Estructura

### Logos
- `pixos-logo.webp` / `pixos-logo.png` - Logo completo de pixOS
- `hsfjm-logo.webp` / `hsfjm-logo.png` - Logo del Hospital San Francisco de Asís Morelia

### Favicons (en `/public`)
- `favicon.ico` - Favicon multi-resolución (16x16, 32x32)
- `favicon-16x16.png` - Favicon 16x16
- `favicon-32x32.png` - Favicon 32x32  
- `apple-touch-icon.png` - Icon para iOS (180x180)
- `icon-192.png` / `icon-192.webp` - PWA icon pequeño
- `icon-512.png` / `icon-512.webp` - PWA icon grande

## 📊 Optimización

### Logos
- **pixOS**: 81KB → 15KB WebP (81% reducción)
- **HSFJM**: 2.0MB → 27KB WebP (98.6% reducción)

### Icons
- **icon-512**: 235KB → 7.1KB WebP (97% reducción)
- **icon-192**: 29KB → 2.5KB WebP (91% reducción)

## 🎨 Uso dinámico por brand

Los logos se muestran según `BRAND_NAME`:
- `BRAND_NAME=PIXOS` → Solo logo de pixOS
- `BRAND_NAME=HSFJM` → Logos de pixOS + HSFJM

Los navegadores modernos cargan automáticamente WebP, con fallback a PNG.

## 🔧 Regenerar assets

### Sincronizar logos desde brands/ (recomendado)
```bash
# Desde la raíz del monorepo
./scripts/sync-brand-assets.sh
```

Este script copia automáticamente los logos desde `brands/*/assets/` a:
- `apps/mobile/src/assets/images/` (para CodePush y Metro Bundler)
- `apps/web/public/assets/` (para web)

### Logos WebP (después de copiar)
```bash
cd apps/web/public/assets
cwebp -q 85 -m 6 pixos-logo.png -o pixos-logo.webp
cwebp -q 80 -m 6 -resize 0 800 hsfjm-logo.png -o hsfjm-logo.webp
```

### Favicons
```bash
cd apps/web/public

# Copiar icon original
cp ../../brands/pixos/assets/icon.png icon-1024.png

# Generar tamaños con sips (macOS)
sips -z 512 512 icon-1024.png --out icon-512.png
sips -z 192 192 icon-1024.png --out icon-192.png
sips -z 180 180 icon-1024.png --out apple-touch-icon.png
sips -z 32 32 icon-1024.png --out favicon-32x32.png
sips -z 16 16 icon-1024.png --out favicon-16x16.png

# Generar .ico con ImageMagick
magick favicon-16x16.png favicon-32x32.png -colors 256 favicon.ico

# Generar WebP
cwebp -q 90 -m 6 icon-512.png -o icon-512.webp
cwebp -q 90 -m 6 icon-192.png -o icon-192.webp

# Limpiar temporal
rm icon-1024.png
```

## 📱 PWA Manifest

El archivo `/public/manifest.json` define la configuración de la Progressive Web App con los iconos generados.
