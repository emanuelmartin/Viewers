# Guía de Pruebas - Optimización Mobile del Visor OHIF

## 🎯 Cambios Realizados

Se ha optimizado el layout del visor OHIF para dispositivos móviles con orientación vertical (< 1024px de ancho):

### 1. **Cambio de Dirección de Paneles**
- **Desktop** (≥1024px): Paneles lado a lado (horizontal)
- **Mobile** (<1024px): Paneles apilados verticalmente (vertical)
- Transición automática al redimensionar

### 2. **Series - Vista Horizontal en Mobile**
- En mobile: Lista horizontal con scroll
- En desktop: Lista vertical en panel lateral
- Thumbnails más pequeños en mobile (100px vs 135px)

### 3. **Cierre Automático de Paneles en Mobile**
- Panel izquierdo (StudyBrowser): Cerrado por defecto
- Panel derecho: Cerrado por defecto
- Viewport maximizado (~85% del espacio)

### 4. **Responsive Tailwind Classes**
- `flex-col lg:flex-row` - apilamiento vertical → horizontal
- `text-[11px] lg:text-[13px]` - texto más pequeño en mobile
- `h-[30px] lg:h-[40px]` - altura compacta en mobile

## 📱 Pruebas en Chrome DevTools

### Pasos:
1. Abre Chrome DevTools: **F12** o **Cmd+Option+I** (Mac)
2. Click en el icono de dispositivo: **Cmd+Shift+M** (Mac)
3. Selecciona dispositivos móviles predefinidos en el desplegable

### Dispositivos Recomendados para Probar:

#### 1. **iPhone SE (375 × 667)** - Smartphone Pequeño
```
✓ Viewport debe maximizarse (sin paneles visibles)
✓ Series deben estar en lista horizontal en la parte inferior
✓ Viewport ocupa ~85% del espacio vertical
✓ Texto compacto pero legible
```

#### 2. **iPhone 12 Pro (390 × 844)** - Smartphone Mediano
```
✓ Mismo comportamiento que iPhone SE pero con más espacio
✓ Series en lista horizontal con scroll
✓ Botones de apertura de paneles accesibles
```

#### 3. **iPad (768 × 1024)** - Tablet Vertical
```
✓ Panel estudiado debería estar más visible
✓ Viewport sigue siendo el elemento principal
✓ Series deben estar en una lista horizontal
```

#### 4. **iPad Pro (1024 × 1366)** - Tablet Grande
```
⚠️ Breakpoint en 1024px - aquí cambia a layout horizontal
✓ Debe cambiar a paneles lado a lado
✓ Series en lista vertical en el panel
```

## 🔍 Verificaciones Clave

### Visual:
- [ ] El viewport es grande y clara en mobile
- [ ] Las series están en una lista horizontal en la parte inferior
- [ ] El texto es legible en mobile
- [ ] No hay elementos cortados o escondidos
- [ ] La transición de layout es suave al cambiar tamaño

### Funcionalidad:
- [ ] Puedo abrir/cerrar la lista de estudios deslizando
- [ ] Puedo seleccionar una serie de la lista horizontal
- [ ] El viewport responde a mis interacciones
- [ ] No hay scroll innecesario en horizontal

### Responsive:
- [ ] En 1023px: Layout vertical (mobile)
- [ ] En 1024px: Layout horizontal (desktop) - cambio visible
- [ ] Redimensionar suavemente transiciona el layout
- [ ] Todos los elementos se ajustan correctamente

## 🛠️ Console DevTools

Abre la consola (F12 → Console) y verifica:

```javascript
// Verificar que los breakpoints de Tailwind funcionan
console.log(window.innerWidth);  // Debería ser < 1024 en mobile

// Buscar elementos con clases responsive
document.querySelectorAll('[class*="lg:"]').length;  // Elementos responsive
```

## 📊 Archivos Modificados

```
extensions/default/src/ViewerLayout/index.tsx
├─ Agregado: Mobile panel close logic
├─ Agregado: Responsive className con flex-col/lg:flex-row
└─ Bugfix: Cierre de paréntesis en height calc

extensions/default/src/ViewerLayout/ResizablePanelsHook.tsx
├─ Agregado: State para detectar mobile
├─ Agregado: Listener window.resize para responsive
└─ Agregado: Cambio dinámico de direction: vertical/horizontal

platform/ui-next/src/components/StudyBrowser/StudyBrowser.tsx
├─ Actualizado: Layout a flex horizontal en mobile
└─ Overflow-x auto para scroll horizontal

platform/ui-next/src/components/StudyItem/StudyItem.tsx
├─ Reducido: Altura de 40px → 30px en mobile
├─ Reducido: Text-size 13px → 11px en mobile
└─ Reducido: Anchos y paddings en mobile

platform/ui-next/src/components/ThumbnailList/ThumbnailList.tsx
├─ Grid responsive: 100px mobile → 135px desktop
└─ Gap responsive: 2px mobile → 4px desktop
```

## ❌ Problemas Conocidos / Notas

- **Proxy Configuration**: Hay una warning sobre configuración de proxy deprecated (no afecta funcionalidad)
- **Vulnerabilidades NPM**: 43 vulnerabilidades reportadas (heredadas de dependencias)
- **Bun Runtime**: Requerido para ejecutar (versión 1.3.10+)

## ✅ Próximos Pasos de Prueba

1. Abrir en diferentes navegadores (Firefox, Safari)
2. Probar en dispositivos reales si es posible
3. Verificar accesibilidad (A11y)
4. Probar gestos touch en mobile (swipe, pinch-zoom)
5. Verificar performance en dispositivos con recursos limitados

## 📸 Comportamiento Esperado

### Mobile (< 1024px)
```
┌─────────────────────────┐
│   Header (52px)         │
├─────────────────────────┤
│                         │
│    VIEWPORT             │
│  (Maximizado)           │
│                         │
├─────────────────────────┤
│ Series Horizontal       │
│ [▨] [▨] [▨] → [▨]     │
└─────────────────────────┘
```

### Desktop (≥ 1024px)
```
┌──────────────────────────────────────┐
│       Header (52px)                  │
├────────┬──────────┬─────────────────┤
│ Left   │ VIEWPORT │ Right           │
│ Panel  │          │ Panel           │
│ 282px  │ Flexible │ 280px           │
└────────┴──────────┴─────────────────┘
```

---

## 🚀 Cómo Ejecutar el Servidor

```bash
cd /Users/emanuelmartin/Documents/GitHub/ViewersOriginal
npm run dev
# Accede a http://localhost:3000
```

Ten en cuenta que quizás necesites usar `npm run dev:fast` si tienes problemas de performance.
