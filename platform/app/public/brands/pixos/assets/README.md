# Assets para PIXOS

## ✅ **Sistema de White Labeling Optimizado**

### 📱 **Archivos principales requeridos**

#### **icon.png** (1024x1024) 
- **Uso:** Iconos de aplicación para las tiendas
- **Función:** Se usa automáticamente con `sips` para generar todos los tamaños de iconos para iOS y Android
- **Ubicación:** `brands/pixos/assets/icon.png`

#### **logo.png** 
- **Uso:** Logos internos dentro de la aplicación
- **Función:** Se copia automáticamente como logo principal, cuadrado y splash
- **Ubicación:** `brands/pixos/assets/logo.png`
- **Se copia a:** 
  - `src/assets/images/logo.png`
  - `src/assets/images/logo-square.png` 
  - `src/assets/images/splash-logo.png`

### 🔧 **Funcionamiento automático mejorado**
1. **icon.png** → Genera automáticamente todos los iconos de aplicación + actualiza `Contents.json`
2. **logo.png** → Se copia a `src/assets/images/` como logos internos
3. **Info.plist** → Solo actualiza `CFBundleDisplayName` manteniendo toda la configuración original
4. **Bundle ID** → Se actualiza en `project.pbxproj` automáticamente
5. **Otros archivos** → Se copian directamente a `src/assets/`

### 📁 **Archivos adicionales opcionales**
Puedes agregar cualquier asset adicional que necesites:
- **logo-white.png** - Logo en blanco para fondos oscuros
- **banner.png** - Banners promocionales
- **backgrounds/** - Carpeta con fondos
- **icons/** - Carpeta con iconos específicos
- Cualquier otro asset que requiera tu app

### 📂 **Estructura recomendada**
```
brands/pixos/assets/
├── icon.png              ← REQUERIDO (1024x1024) - Iconos de app
├── logo.png              ← REQUERIDO - Logos internos
├── logo-white.png        ← Opcional
├── banner.png            ← Opcional
├── backgrounds/          ← Opcional
│   ├── login-bg.png
│   └── home-bg.png
└── icons/                ← Opcional
    ├── menu-icon.png
    └── settings-icon.png
```
