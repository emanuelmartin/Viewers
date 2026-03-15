# Mobile Layout Optimization - Cambios Realizados

## Resumen
Se ha optimizado el layout del visor OHIF para dispositivos móviles con orientación vertical, mejorando significativamente la experiencia del usuario en pantallas pequeñas.

## Cambios Implementados

### 1. **ViewerLayout (`extensions/default/src/ViewerLayout/index.tsx`)**
- ✅ Agregado soporte para cierre automático de paneles en mobile
- ✅ En dispositivos móviles (< 1024px de ancho):
  - El panel derecho se cierra por defecto para maximizar el viewport
  - El panel izquierdo se cierra por defecto pero el usuario puede abrirlo
- ✅ Los paneles siguen siendo redimensionables en desktop
- ✅ Corregido error de sintaxis en el style height (faltaba cierre de paréntesis)

### 2. **ResizablePanelsHook (`extensions/default/src/ViewerLayout/ResizablePanelsHook.tsx`)**
- ✅ Agregado listener para detectar cambios de tamaño de ventana
- ✅ Cambio dinámico de dirección de paneles:
  - Desktop (≥1024px): `horizontal` (paneles lado a lado)
  - Mobile (<1024px): `vertical` (paneles apilados verticalmente)
- ✅ Detecta automáticamente transiciones responsive

### 3. **StudyBrowser (`platform/ui-next/src/components/StudyBrowser/StudyBrowser.tsx`)**
- ✅ Lista de estudios es horizontal en mobile (con scroll horizontal)
- ✅ En desktop mantiene el layout vertical
- ✅ Usa Tailwind breakpoints: `flex` vs `lg:flex-col`

### 4. **StudyItem (`platform/ui-next/src/components/StudyItem/StudyItem.tsx`)**
- ✅ Altura reducida en mobile: 30px vs 40px en desktop
- ✅ Texto más pequeño en mobile: `text-[11px]` vs `text-[13px]`
- ✅ Anchos máximos ajustados en mobile
- ✅ Información más compacta pero legible

### 5. **ThumbnailList (`platform/ui-next/src/components/ThumbnailList/ThumbnailList.tsx`)**
- ✅ Grid responsive con Tailwind:
  - Mobile: `grid-cols-[repeat(auto-fit,_minmax(0,100px))]` (thumbnails más pequeños)
  - Desktop: `grid-cols-[repeat(auto-fit,_minmax(0,135px))]` (thumbnails más grandes)
- ✅ Gap reducido en mobile: `gap-[2px]` vs `gap-[4px]`

## Comportamiento en Mobile (Vertical)

### Estructura
```
┌─────────────────────┐
│   Header (52px)     │
├─────────────────────┤
│                     │
│    VIEWPORT         │  ← Maximizado (~85% del espacio)
│  (Grande y limpio)  │
│                     │
├─────────────────────┤
│  Series (Horizontal)│  ← Lista deslizable horizontal
│  [▨] [▨] [▨] [▨]   │     (puede contraerse)
└─────────────────────┘
```

### Características
1. **Viewport Maximizado**: El área de visualización ocupa el máximo espacio posible
2. **Panel de Series Horizontal**: Las series están en una lista horizontal abajo
3. **Paneles Cerrados por Defecto**: Left y Right panels se cierran para máximo espacio
4. **Interactividad**: El usuario puede abrir/cerrar paneles según sea necesario
5. **Responsive**: Transición automática a 1024px

## Comportamiento en Desktop (Horizontal)

### Estructura
```
┌─────────────────────────────────────────┐
│          Header (52px)                  │
├────────┬─────────────────┬──────────┤
│Left    │                 │  Right   │
│Panel   │  VIEWPORT       │  Panel   │
│(282px) │  (Flexible)     │ (280px)  │
│        │                 │          │
└────────┴─────────────────┴──────────┘
```

### Características
1. **Layout Lateral**: Paneles a los lados, viewport en el centro
2. **Redimensionables**: Los paneles se pueden ajustar manualmente
3. **Series en Panel**: Lista vertical de series en el panel izquierdo
4. **Manejo Completo**: Acceso rápido a todos los paneles

## Puntos Breakpoints

- **Mobile**: < 1024px (tablets verticales y teléfonos)
- **Desktop**: ≥ 1024px (tablets horizontales, escritorio)

## Testing Recomendado

1. Abrir la aplicación en dispositivos móviles
2. Verificar que el viewport se maximiza
3. Probar scroll horizontal de series
4. Abrir/cerrar paneles con botones
5. Redimensionar ventana de desktop y verificar transición responsive
6. Verificar accesibilidad y usabilidad en móvil

## Archivos Modificados

```
extensions/default/src/ViewerLayout/index.tsx
extensions/default/src/ViewerLayout/ResizablePanelsHook.tsx
platform/ui-next/src/components/StudyBrowser/StudyBrowser.tsx
platform/ui-next/src/components/StudyItem/StudyItem.tsx
platform/ui-next/src/components/ThumbnailList/ThumbnailList.tsx
```

## Notas Técnicas

- Se utilizan media queries de Tailwind CSS con breakpoint `lg:` (1024px)
- Los cambios son completamente backwards compatible
- No hay cambios en la lógica de negocio, solo en la presentación
- El sistema de paneles resizables sigue funcionando igual en desktop
- En mobile, los paneles siguen siendo redimensionables pero con dirección vertical

## Mejoras Futuras Posibles

1. Agregar botón de toggle de sidebar en mobile
2. Implementar gestos touch para swipe entre vistas
3. Optimizar tamaños de iconos en mobile
4. Agregar vista de lista compacta para series en mobile
5. Implementar bottom sheet para paneles en mobile
