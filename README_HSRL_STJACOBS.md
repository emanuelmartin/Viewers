# OHIF Viewer - Configuraciones HSRL y STJacobs

## 📦 Resumen

Se han creado dos configuraciones completas para ejecutar OHIF Viewer conectado a Orthanc, específicamente para HSRL y STJacobs, sin explorador de estudios y con viewport maximizado.

## 📁 Archivos Creados

### Configuraciones (en `platform/app/public/config/`)

```
hsrl_orthanc.js       (105 líneas)
stjacobs_orthanc.js   (105 líneas)
```

**Características:**
- ✅ Conexión DICOMweb a Orthanc
- ✅ Sin explorador de estudios (`showStudyList: false`)
- ✅ Viewport maximizado
- ✅ Soporte QIDO-RS y WADO-RS
- ✅ Lazy loading de series
- ✅ Búsqueda difusa y comodines
- ✅ Upload de DICOM habilitado

### Documentación (en raíz del proyecto)

```
ORTHANC_SETUP_GUIDE.md     (Documentación técnica completa)
QUICK_START.md             (Inicio rápido en 5 minutos)
INSTALACION_RAPIDA.md      (Guía en español)
MOBILE_OPTIMIZATION_CHANGES.md  (Optimizaciones mobile)
MOBILE_TESTING_GUIDE.md    (Pruebas en mobile)
```

## 🚀 Inicio Rápido

### 1. Instalar Dependencias
```bash
cd /Users/emanuelmartin/Documents/GitHub/ViewersOriginal
npm install --legacy-peer-deps
```

### 2. Instalar Bun
```bash
curl -fsSL https://bun.sh/install | bash
exec /bin/zsh
```

### 3. Ejecutar Orthanc (Docker)
```bash
docker run -it --rm -p 8042:8042 -p 4242:4242 jodogne/orthanc
```

### 4. Cargar Estudios
Ir a http://localhost:8042 → Upload → seleccionar archivo DICOM

### 5. Ejecutar OHIF
```bash
npm run dev:fast
# Acceder a http://localhost:3000
```

## 🔗 URLs por Defecto

Las configuraciones asumen que Orthanc está en:
- **Endpoint DICOMweb**: `/orthanc/dicom-web`
- **Puerto Orthanc**: 8042

Si es diferente, editar los archivos de configuración:

```javascript
wadoUriRoot: 'http://TU_URL:8042/dicom-web',
qidoRoot: 'http://TU_URL:8042/dicom-web',
wadoRoot: 'http://TU_URL:8042/dicom-web',
```

## 📝 Cambios Incluidos

### 1. Configuración HSRL
- Nombre: HSRL Orthanc DICOM Server
- Data source: `hsrl`
- Sin explorador de estudios
- URLs relativas a Orthanc

### 2. Configuración STJacobs
- Nombre: STJacobs Orthanc DICOM Server
- Data source: `stjacobs`
- Sin explorador de estudios
- URLs relativas a Orthanc

### 3. Optimizaciones Mobile (ya incluidas)
- Layout responsive (`flex-col` en mobile, `flex-row` en desktop)
- Pannels apilados verticalmente en mobile
- Series en lista horizontal
- Viewport maximizado

## 🔧 Configurar para Tu Entorno

### Local (Orthanc en localhost:8042)
No cambiar nada, funciona por defecto.

### Docker Compose
Usar proxy inverso nginx que apunte a `/orthanc/` hacia el contenedor Orthanc.

### Máquina Remota
Cambiar URLs en configuración a:
```javascript
wadoUriRoot: 'http://orthanc.tudominio.com/dicom-web',
qidoRoot: 'http://orthanc.tudominio.com/dicom-web',
wadoRoot: 'http://orthanc.tudominio.com/dicom-web',
```

## 🐳 Para Producción

### Docker Build
```bash
npm run build:viewer
docker build -t ohif-hsrl .
docker run -p 3000:3000 -e CONFIG=hsrl_orthanc ohif-hsrl
```

### Docker Compose
```bash
docker-compose up
# Acceder a http://localhost:3000
```

## 📊 Estructura de Aplicación

```
OHIF Viewer (http://localhost:3000)
│
├─ Configuración: hsrl_orthanc.js
│
└─ DICOMweb API
   │
   └─ Orthanc Server (http://localhost:8042)
      ├─ QIDO-RS (búsqueda de estudios)
      ├─ WADO-RS (descarga de imágenes)
      └─ Almacenamiento DICOM
```

## 🎯 Funcionalidades Principales

- **Búsqueda de Estudios**: QIDO-RS contra Orthanc
- **Visualización**: Viewport DICOM 2D/3D
- **Sin Explorador**: UI limpia, solo visualizador
- **Lazy Loading**: Carga de series bajo demanda
- **Fuzzy Search**: Búsqueda inteligente en Orthanc
- **Upload**: Opción de subir nuevos DICOM
- **Mobile**: Interfaz optimizada para dispositivos móviles

## 🔍 Verificación

### Verificar conexión a Orthanc
```bash
curl http://localhost:8042/api/system
```

### Ver estudios en Orthanc
```bash
curl http://localhost:8042/api/studies
```

### DevTools Chrome
- F12 → Network → Ver peticiones a `/orthanc/dicom-web`
- F12 → Console → Verificar sin errores

## 📚 Documentación Disponible

| Archivo | Contenido |
|---------|-----------|
| `ORTHANC_SETUP_GUIDE.md` | Setup técnico completo, troubleshooting, Docker |
| `QUICK_START.md` | Inicio en 5 minutos, comandos esenciales |
| `INSTALACION_RAPIDA.md` | Guía en español, paso a paso |
| `MOBILE_OPTIMIZATION_CHANGES.md` | Cambios de optimización mobile |
| `MOBILE_TESTING_GUIDE.md` | Cómo probar en Chrome DevTools |

## 🛠️ Requisitos

- Node.js 18+ LTS
- npm 8+
- Bun 1.3+
- Orthanc 1.10+
- Docker (opcional, pero recomendado)

## ⚠️ Notas Importantes

1. **Sin Explorador de Estudios**: Si necesitas activar el panel de búsqueda, cambiar `showStudyList: false` a `true` en la configuración.

2. **Orthanc Vacío**: Necesitas cargar estudios DICOM a Orthanc primero.

3. **CORS**: Si Orthanc está en máquina diferente, usar proxy inverso nginx.

4. **Desarrollo vs Producción**: 
   - Desarrollo: `npm run dev` o `npm run dev:fast`
   - Producción: `npm run build:viewer`

## 🚀 Comandos Rápidos

```bash
# Instalar/actualizar
npm install --legacy-peer-deps

# Desarrollo
npm run dev
npm run dev:fast

# Build
npm run build:viewer

# Tests
npm run test:unit

# Limpieza
npm run clean
```

## ✅ Checklist de Verificación

- [ ] Dependencias instaladas
- [ ] Bun disponible en PATH
- [ ] Orthanc corriendo en puerto 8042
- [ ] Estudios DICOM en Orthanc
- [ ] `npm run dev` ejecutándose
- [ ] App accesible en http://localhost:3000
- [ ] Imágenes cargando sin errores
- [ ] DevTools sin errores rojos

## 📞 Troubleshooting

Para problemas comunes, ver:
- `ORTHANC_SETUP_GUIDE.md` → Sección "Problemas Comunes"
- `INSTALACION_RAPIDA.md` → Sección "Solucionar Problemas"

## 📄 Licencia

Este proyecto usa OHIF (MIT License) y Orthanc (AGPL License).

---

**Versión**: 1.0
**Actualizado**: Marzo 2026
**Para**: HSRL y STJacobs
