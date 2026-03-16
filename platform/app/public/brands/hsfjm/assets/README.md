# Assets para HSFJM

## Archivos principales requeridos

### **icon.png** (1024x1024) 
- **Uso:** Iconos de aplicación para las tiendas
- **Función:** Se usa automáticamente con ImageMagick para generar todos los tamaños de iconos para iOS y Android
- **Ubicación:** `brands/hsfjm/assets/icon.png`

### **logo.png** 
- **Uso:** Logos internos dentro de la aplicación
- **Función:** Se copia automáticamente como logo principal, cuadrado y splash
- **Ubicación:** `brands/hsfjm/assets/logo.png`
- **Se copia a:** 
  - `src/assets/images/logo.png`
  - `src/assets/images/logo-square.png` 
  - `src/assets/images/splash-logo.png`

## Archivos adicionales opcionales
Puedes agregar cualquier asset adicional que necesites, todos se copiarán a `src/assets/`:
- **logo-white.png** - Logo en blanco para fondos oscuros
- **banner.png** - Banners promocionales
- **backgrounds/** - Carpeta con fondos
- **icons/** - Carpeta con iconos específicos
- Cualquier otro asset que requiera tu app

## Funcionamiento automático
1. **icon.png** → Genera iconos de aplicación para iOS y Android
2. **logo.png** → Se copia a `src/assets/images/` como logos internos
3. **Otros archivos** → Se copian directamente a `src/assets/`

## Estructura recomendada
```
brands/hsfjm/assets/
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
