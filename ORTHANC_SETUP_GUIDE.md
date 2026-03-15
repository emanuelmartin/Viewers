# Guía de Instalación y Uso - OHIF Viewer con Orthanc

## 📋 Resumen

Este documento describe cómo instalar, configurar y ejecutar el visor OHIF con Orthanc para dos instituciones:
- **HSRL**: Hospital/Centro HSRL
- **STJacobs**: Hospital/Centro STJacobs

El visor está configurado para **NO mostrar el explorador de estudios**, solo el viewport maximizado para visualizar imágenes DICOM.

## 🔧 Requisitos Previos

- **Node.js** 18+ (se recomienda 18 LTS o 20 LTS)
- **Yarn** 1.22+ (gestor de paquetes)
- **Orthanc** 1.10+ instalado y ejecutándose
- **Git** (para clonar el repositorio)
- Conexión a red hacia Orthanc

## 📦 Instalación

### 1. Clonar y Preparar el Proyecto

```bash
# Clonar el repositorio
git clone https://github.com/OHIF/Viewers.git
cd Viewers

# O si ya está clonado, hacer pull de los últimos cambios
git pull origin main

# Habilitar yarn workspaces
yarn config set workspaces-experimental true

# Instalar dependencias
yarn install --frozen-lockfile
```

#### Opción A: Usando Docker (Recomendado)

```bash
# Crear directorio de datos
mkdir -p ~/orthanc-data

# Ejecutar Orthanc en Docker
docker run -it --rm \
  -p 8042:8042 \
  -p 4242:4242 \
  -v ~/orthanc-data:/var/lib/orthanc/db \
  jodogne/orthanc

# Orthanc estará disponible en:
# Web UI: http://localhost:8042
# API REST: http://localhost:8042/api
# DICOMweb: http://localhost:8042/dicom-web
```

#### Opción B: Instalación Nativa

Para macOS:
```bash
brew install orthanc
brew services start orthanc
```

Para Linux (Debian/Ubuntu):
```bash
sudo apt-get update
sudo apt-get install orthanc
sudo systemctl start orthanc
```

### 4. Configurar Proxy Inverso (Opcional pero Recomendado)

Si Orthanc está en una máquina diferente a OHIF, configura un proxy inverso (nginx).

#### Ejemplo nginx.conf:

```nginx
upstream orthanc_backend {
    server orthanc.hospital.local:8042;
}

server {
    listen 80;
    server_name viewer.hospital.local;

    # Proxy para Orthanc
    location /orthanc/ {
        proxy_pass http://orthanc_backend/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Permitir CORS
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type, Authorization";
    }

    # Proxy para OHIF
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🚀 Ejecución

### Verificar que Orthanc está corriendo

```bash
# Probar conexión a Orthanc
curl http://localhost:8042/api/system

# Debería retornar algo como:
# {
#   "ApiVersion": 14,
#   "Name": "Orthanc",
#   ...
# }
```

### Ejecutar OHIF en Desarrollo

```bash
cd /path/to/ViewersOriginal

# Opción 1: Usar configuración HSRL
yarn dev -- --config=hsrl_orthanc

# Opción 2: Usar configuración STJacobs
yarn dev -- --config=stjacobs_orthanc

# Opción 3: Dev rápido (menos optimización, carga más rápida)
yarn dev:fast -- --config=hsrl_orthanc
```

La aplicación estará disponible en: **http://localhost:3000**

### Compilación para Producción

```bash
# Compilar aplicación
yarn build

# Compilar para producción con optimizaciones
yarn build:viewer

# La salida será en: platform/app/dist/
```

## 🔗 Configuración de URLs de Orthanc

### Escenario 1: Orthanc en localhost:8042

En `hsrl_orthanc.js` y `stjacobs_orthanc.js`, cambiar:

```javascript
wadoUriRoot: 'http://localhost:8042/dicom-web',
qidoRoot: 'http://localhost:8042/dicom-web',
wadoRoot: 'http://localhost:8042/dicom-web',
```

### Escenario 2: Orthanc tras proxy inverso

```javascript
wadoUriRoot: '/orthanc/dicom-web',
qidoRoot: '/orthanc/dicom-web',
wadoRoot: '/orthanc/dicom-web',
```

Nginx redirigirá automáticamente `/orthanc/` al servidor real.

### Escenario 3: Orthanc en máquina remota

```javascript
wadoUriRoot: 'http://orthanc.hospital.local:8042/dicom-web',
qidoRoot: 'http://orthanc.hospital.local:8042/dicom-web',
wadoRoot: 'http://orthanc.hospital.local:8042/dicom-web',
```

## 📡 Flujo de Datos

```
┌─────────────────────────────────────────────────────────────┐
│                    OHIF Viewer                              │
│              (http://localhost:3000)                        │
│                                                             │
│  Configuración: hsrl_orthanc.js o stjacobs_orthanc.js      │
│  - showStudyList: false                                    │
│  - Viewport maximizado                                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ DICOMweb API Calls
                 │ QIDO-RS (buscar estudios)
                 │ WADO-RS (descargar imágenes)
                 ↓
┌─────────────────────────────────────────────────────────────┐
│                   Servidor Orthanc                          │
│  (http://localhost:8042 o proxy inverso)                   │
│                                                             │
│  - Almacenamiento de DICOM                                 │
│  - API DICOMweb (QIDO-RS, WADO-RS)                        │
│  - Web UI de administración (puerto 8042)                  │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Usar la Aplicación

### Con Explorador de Estudios Deshabilitado

1. **Acceder a través de URL directa con estudio:**

```
http://localhost:3000/viewer?urlParams=%7B%22StudyInstanceUIDs%22:%22studyUID%22%7D
```

2. **O con QIDO-RS implícito:**

La configuración DICOMweb permitirá que OHIF busque estudios directamente en Orthanc.

3. **Pasar estudio vía parámetros de URL:**

```javascript
// URL con Study Instance UID
http://localhost:3000/viewer?StudyInstanceUIDs=1.2.3.4.5

// URL con múltiples estudios
http://localhost:3000/viewer?StudyInstanceUIDs=1.2.3&StudyInstanceUIDs=1.2.4
```

## 🔍 Debugging y Verificación

### Ver logs en Consola del Navegador

Abre DevTools (F12) → Console y verifica:

```javascript
// Ver configuración actual
console.log(window.config);

// Ver datasourceManager
// Se mostrará en la consola automáticamente
```

### Verificar Conexión a Orthanc

```bash
# Desde línea de comandos
curl http://localhost:8042/api/studies

# Debería retornar array de estudios JSON
# Si está vacío, cargar estudios primero
```

### Ver Network Requests

En Chrome DevTools → Network tab, deberías ver:
- Llamadas a `/orthanc/dicom-web/studies` (QIDO-RS)
- Llamadas a `/orthanc/dicom-web/studies/.../instances` (WADO-RS)
- Respuestas 200 (OK)

## 📝 Configuraciones Disponibles

### Archivos de Propiedades DICOMweb

| Propiedad | Descripción |
|-----------|-------------|
| `friendlyName` | Nombre mostrado en UI |
| `wadoUriRoot` | URL base para acceso a imágenes |
| `qidoRoot` | URL base para búsqueda (QIDO-RS) |
| `wadoRoot` | URL base para WADO-RS |
| `qidoSupportsIncludeField` | Si Orthanc soporta filtros includeField |
| `imageRendering` | Tipo: 'wadors' o 'wado' |
| `enableStudyLazyLoad` | Cargar series bajo demanda |
| `supportsFuzzyMatching` | Búsqueda difusa |
| `supportsWildcard` | Búsqueda con comodines |

## ⚠️ Problemas Comunes

### Error: "Cannot connect to Orthanc"

**Causa**: URL incorrecta o Orthanc no responde.

**Solución**:
1. Verificar que Orthanc está corriendo: `curl http://localhost:8042/api/system`
2. Verificar URLs en configuración
3. Revisar CORS si está en máquinas diferentes

### Error: "No studies found"

**Causa**: Orthanc vacío o sin acesoal datos.

**Solución**:
1. Cargar estudios DICOM a Orthanc:
   - Via Web UI: http://localhost:8042 (pestaña "Send DICOM via HTTP")
   - Via command line: `dcmsend -v -u OHIF localhost:4242 archivo.dcm`
   - Via DICOM C-STORE: Configurar en tu PACS

### Error: "CORS error"

**Causa**: El navegador bloquea peticiones cross-origin.

**Solución**:
- Usar proxy inverso (nginx) para el mismo dominio
- O configurar CORS en Orthanc

## 🏗️ Docker Compose (Recomendado para Producción)

Crea `docker-compose.yml`:

```yaml
version: '3.8'

services:
  orthanc:
    image: jodogne/orthanc:latest
    ports:
      - "8042:8042"      # Web UI
      - "4242:4242"      # DICOM
    volumes:
      - orthanc-data:/var/lib/orthanc/db
    environment:
      ORTHANC_DICOM_ALWAYS_ALLOW_ECHOSCU: "true"

  ohif:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      CONFIG_FILE: hsrl_orthanc.js
    depends_on:
      - orthanc

volumes:
  orthanc-data:
```

Ejecutar:
```bash
docker-compose up
```

## 📚 Recursos Adicionales

- **OHIF Docs**: https://docs.ohif.org
- **Orthanc Docs**: https://book.orthanc-server.com
- **DICOMweb Spec**: https://www.dicomstandard.org/standards/use-cases/dicomweb

## ✅ Checklist de Instalación

- [ ] Node.js 18+ instalado
- [ ] Yarn funcional (`yarn --version`)
- [ ] Orthanc corriendo en puerto 8042
- [ ] Estudios DICOM cargados en Orthanc
- [ ] Archivos de config (hsrl_orthanc.js, stjacobs_orthanc.js) creados
- [ ] URLs de Orthanc correctas en config
- [ ] `yarn dev` ejecutado exitosamente
- [ ] Yarn workspaces habilitado
- [ ] Aplicación accesible en http://localhost:3000

---

**Última actualización**: Marzo 2026
**Autor**: Emanuel Martin
**Versión OHIF**: 3.12.x
