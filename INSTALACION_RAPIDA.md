# Guía de Instalación OHIF con Orthanc - Español

## 📋 ¿Qué hemos creado?

Dos configuraciones completamente funcionales para conectar OHIF con Orthanc:

1. **hsrl_orthanc.js** - Configuración para HSRL
2. **stjacobs_orthanc.js** - Configuración para STJacobs

Ambas características:
- ✅ **Sin explorador de estudios** (showStudyList: false)
- ✅ Viewport maximizado
- ✅ Conecta directamente con Orthanc
- ✅ Soporta búsqueda de estudios vía DICOMweb

## 🚀 Pasos de Instalación

### Paso 1: Clonar/Actualizar Repositorio

```bash
# Si ya está clonado
cd /Users/emanuelmartin/Documents/GitHub/ViewersOriginal
git pull

# Si no está clonado
git clone https://github.com/OHIF/Viewers.git
cd Viewers
```

### Paso 2: Instalar Dependencias

```bash
# Habilitar yarn workspaces (monorepo)
yarn config set workspaces-experimental true

# Primera vez - instalar todo
yarn install --frozen-lockfile

# Actualizaciones futuras
yarn upgrade-interactive
```

### Paso 3: Instalar y Ejecutar Orthanc

#### Opción A: Docker (Recomendado - más fácil)

```bash
# Crear carpeta para datos
mkdir -p ~/orthanc-data

# Ejecutar Orthanc en Docker
docker run -it --rm \
  -p 8042:8042 \
  -p 4242:4242 \
  -v ~/orthanc-data:/var/lib/orthanc/db \
  jodogne/orthanc

# Verifica que respondió (en otra terminal)
curl http://localhost:8042/api/system
```

#### Opción B: Instalación Nativa en macOS

```bash
# Instalar via Homebrew
brew install orthanc

# Iniciar servicio
brew services start orthanc

# Verificar
curl http://localhost:8042/api/system
```

### Paso 5: Cargar Estudios DICOM a Orthanc

1. Abre en navegador: **http://localhost:8042**
2. Ve a la pestaña **"Upload"**
3. Selecciona un archivo DICOM
4. Haz clic en **"Upload"**

O desde línea de comandos:

```bash
# Si tienes archivos DICOM
dcmsend -v -u OHIF localhost:4242 tu_archivo.dcm
```

### Paso 5: Ejecutar OHIF

```bash
cd /Users/emanuelmartin/Documents/GitHub/ViewersOriginal

# Ejecutar con configuración HSRL
yarn dev
# O más rápido:
yarn dev:fast

# La app estará en http://localhost:3000
```

## 🔗 URLs y Configuración

### Verificar que Orthanc responde

```bash
curl http://localhost:8042/api/system
# Debería devolver JSON con sistema info
```

### Archivos de Configuración

Los archivos están en:
```
/Users/emanuelmartin/Documents/GitHub/ViewersOriginal/
platform/app/public/config/
├── hsrl_orthanc.js       ← HSRL
└── stjacobs_orthanc.js   ← STJacobs
```

### Puntos clave en la configuración:

```javascript
// Estas líneas apuntan a Orthanc
wadoUriRoot: '/orthanc/dicom-web',   // Para imágenes
qidoRoot: '/orthanc/dicom-web',      // Para búsqueda
wadoRoot: '/orthanc/dicom-web',      // Para acceso

// Sin explorador de estudios
showStudyList: false,    // ← Viewport solo, sin paneles
```

### Si Orthanc está en máquina diferente:

Cambiar las URLs a:
```javascript
wadoUriRoot: 'http://NOMBRE_O_IP_ORTHANC:8042/dicom-web',
qidoRoot: 'http://NOMBRE_O_IP_ORTHANC:8042/dicom-web',
wadoRoot: 'http://NOMBRE_O_IP_ORTHANC:8042/dicom-web',
```

## 🎯 Acceder a la Aplicación

### Sin Explorador de Estudios

La app no mostrará un botón para buscar estudios. Para acceder a un estudio:

1. **Vía URL directa:**
```
http://localhost:3000/viewer?StudyInstanceUIDs=1.2.3.4.5
```

2. **Vía búsqueda en Orthanc ya**:
   - Si ya tiene DICOMweb, OHIF puede buscar directamente

### Con el Explorador activado (si lo necesitas)

Para activar el panel de estudios, edita el archivo y cambia:

```javascript
showStudyList: true,  // ← Cambiar a true
```

## 🐳 Docker Compose (Producción)

Para ejecutar todo junto (OHIF + Orthanc):

```bash
# Crear archivo docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  orthanc:
    image: jodogne/orthanc:latest
    ports:
      - "8042:8042"
      - "4242:4242"
    volumes:
      - orthanc-data:/var/lib/orthanc/db

  ohif:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - orthanc

volumes:
  orthanc-data:
EOF

# Ejecutar
docker-compose up
```

## 🔍 Verificar que Funciona

### En el navegador (Chrome DevTools)

Abre DevTools (F12) y:

1. Ve a **Network tab**
2. Deberías ver peticiones a:
   - `/orthanc/dicom-web/studies`
   - `/orthanc/dicom-web/...instances`
   - Con estado **200 OK**

3. Ve a **Console tab**
   - No debe haber errores rojos
   - Ver: `window.config` para verificar config

### Desde línea de comandos

```bash
# Ver estudios en Orthanc
curl http://localhost:8042/api/studies

# Debería devolver algo como:
# ["2024-03-15-DICOM-IMAGE","another-study"]

# Ver detalle de un estudio
curl "http://localhost:8042/api/studies/2024-03-15-DICOM-IMAGE"
```

## 🛠️ Solucionar Problemas

### Problema: "Cannot connect to server"

```bash
# Verificar que Orthanc está corriendo
curl http://localhost:8042

# Si no response, iniciar Orthanc
docker run -it --rm -p 8042:8042 -p 4242:4242 jodogne/orthanc
```

### Problema: Puerto 3000 en uso

```bash
# Encontrar qué está usando puerto 3000
lsof -i :3000

# Matar el proceso (PID)
kill -9 12345
```

### Problema: Yarn error

```bash
# Limpiar cacheé e reinstalar
yarn cache clean
rm -rf node_modules
yarn install --frozen-lockfile
```

### Problema: No hay estudios

1. Verificar que hay estudios en Orthanc:
   ```bash
   curl http://localhost:8042/api/studies
   ```

2. Si está vacío, cargar:
   - Vía Orthanc UI: http://localhost:8042 → Upload
   - O via command: `dcmsend -v localhost:4242 archivo.dcm`

### Problema: CORS error

Si Orthanc está en máquina diferente:

1. Usar proxy inverso (nginx)
2. O configurar CORS en Orthanc

Ver documentación completa en: `ORTHANC_SETUP_GUIDE.md`

## 📚 Documentación Completa

Para más detalles, ver:
- `ORTHANC_SETUP_GUIDE.md` - Documentación técnica completa
- `QUICK_START.md` - Inicio rápido
- `MOBILE_OPTIMIZATION_CHANGES.md` - Optimizaciones mobile

## 📝 Resumen de Comandos

```bash
# Instalar dependencias
yarn config set workspaces-experimental true
yarn install --frozen-lockfile

# Ejecutar en desarrollo
yarn dev

# Ejecutar con reload rápido
yarn dev:fast

# Compilar para producción
yarn build:viewer

# Ejecutar tests
yarn test:unit

# Limpiar compilación
yarn clean

# Ver workspaces
yarn workspaces list
```

## ✅ Checklist Final

- [ ] Node.js 18+ instalado (`node --version`)
- [ ] Yarn instalado (`yarn --version`)
- [ ] Orthanc corriendo (`curl http://localhost:8042`)
- [ ] Estudios cargados en Orthanc
- [ ] Dependencias instaladas (`yarn install --frozen-lockfile`)
- [ ] App corriendo (`yarn dev`)
- [ ] Accesible en http://localhost:3000
- [ ] DICOMweb conectado (sin errores en DevTools)
- [ ] Imágenes visibles en viewport

## 🎓 Próximos Pasos Opcionales

1. **Configurar SSL/HTTPS** para usar en máquinas remotas
2. **Instalar authenticación** (OAuth, LDAP, etc.)
3. **Configurar múltiples datasources** (varios Orthanc, etc.)
4. **Optimizar para producción** (Docker, nginx, etc.)
5. **Integrar con PACS** para envío automático de estudios

---

**¿Dudas?** Revisa la documentación más completa en `ORTHANC_SETUP_GUIDE.md`

**Última Actualización**: Marzo 2026
