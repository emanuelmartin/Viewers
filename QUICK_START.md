# Quick Start Guide - OHIF + Orthanc

## 🚀 Inicio Rápido en 5 Minutos

### 1. Instalar Dependencias (solo primera vez)

```bash
cd /path/to/ViewersOriginal
yarn config set workspaces-experimental true
yarn install --frozen-lockfile
```

### 2. Verificar Orthanc

```bash
# Orthanc debe estar corriendo en puerto 8042
curl http://localhost:8042/api/system

# Si no está corriendo, iniciar Docker:
docker run -it --rm -p 8042:8042 -p 4242:4242 jodogne/orthanc
```

### 4. Cargar Estudios a Orthanc

Ve a: **http://localhost:8042**
- Pestaña "Upload"
- Selecciona archivo DICOM
- Haz clic en "Upload"

### 3. Ejecutar OHIF

```bash
cd /path/to/ViewersOriginal

# Opción A: HSRL
yarn dev

# Opción B: STJacobs
# (Edita platform/app/public/config/default.js y cambia showStudyList: false)

# Opción C: Dev rápido
yarn dev:fast
```

### 6. Acceder a la Aplicación

Abre en navegador: **http://localhost:3000**

---

## 📁 Archivos de Config Creados

```
platform/app/public/config/
├── hsrl_orthanc.js       ← HSRL config (sin explorador)
└── stjacobs_orthanc.js   ← STJacobs config (sin explorador)
```

## ⚙️ Cambiar Entre Configuraciones

### Opción 1: Via URL Query Parameter

```bash
http://localhost:3000?config=hsrl_orthanc
http://localhost:3000?config=stjacobs_orthanc
```

### Opción 2: Editar default.js

```bash
# Abrir archivo
vim platform/app/public/config/default.js

# Cambiar línea que importa config y usar hsrl_orthanc o stjacobs_orthanc
```

### Opción 3: Webpack serve (mejor)

```bash
npm run dev -- --config=hsrl_orthanc
```

## 🔧 Ajustar URLs de Orthanc

Si Orthanc está en URL diferente, editar:

```javascript
// hsrl_orthanc.js y stjacobs_orthanc.js
wadoUriRoot: 'http://TU_URL:8042/dicom-web',  // ← Cambiar aquí
qidoRoot: 'http://TU_URL:8042/dicom-web',     // ← Cambiar aquí
wadoRoot: 'http://TU_URL:8042/dicom-web',     // ← Cambiar aquí
```

## 📊 Verificar Funcionamiento

En Chrome DevTools (F12):

1. **Network tab**: Deberías ver peticiones a `/orthanc/dicom-web/studies`
2. **Console tab**: Sin errores rojos
3. **Application tab**: Imágenes cargando

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| Puerto 3000 en uso | `lsof -i :3000` y `kill -9 PID` |
| Orthanc no responde | Verificar: `curl http://localhost:8042` |
| CORS error | Usar proxy inverso (nginx) |
| No hay estudios | Cargar DICOM a Orthanc |
| Yarn error | `yarn cache clean && yarn install --frozen-lockfile` |

## 📖 Documentación Completa

Ver: `ORTHANC_SETUP_GUIDE.md` en el repo

---

**Pro tips:**
- `yarn dev:fast` para desarrollo más rápido
- Usa `yarn build:viewer` para producción
- Revisa logs con `yarn dev -- --verbose`
