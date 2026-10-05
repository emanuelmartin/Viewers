/**
 * Segmentation tools for the PixOS workflows. The HRSL mode (longitudinal)
 * creates labelmaps but registers no tool to draw them, so the extension adds
 * them to every tool group, passive: one-click region segmentation
 * (ClickSegment) and brushes to correct it. They are only activated from the
 * PixOS panel, which is for physicians with a RIS session.
 */
const RADIUS = { minRadius: 0.5, maxRadius: 99.5 };

const SEG_TOOLS = (names: Record<string, string>) => [
  { toolName: names.ClickSegment || 'ClickSegment' },
  { toolName: 'CircularBrush', parentTool: 'Brush', configuration: { activeStrategy: 'FILL_INSIDE_CIRCLE', ...RADIUS } },
  { toolName: 'CircularEraser', parentTool: 'Brush', configuration: { activeStrategy: 'ERASE_INSIDE_CIRCLE', ...RADIUS } },
  {
    toolName: 'ThresholdCircularBrush', parentTool: 'Brush',
    configuration: { activeStrategy: 'THRESHOLD_INSIDE_CIRCLE', ...RADIUS, threshold: { isDynamic: true, dynamicRadius: 3 } },
  },
];

export const SEG_TOOL_NAMES = { click: 'ClickSegment', brush: 'CircularBrush', eraser: 'CircularEraser', threshold: 'ThresholdCircularBrush' };

export function installSegmentationTools(servicesManager: any, extensionManager: any): () => void {
  const { toolGroupService } = servicesManager.services;
  let names: Record<string, string> = {};
  try {
    names = extensionManager.getModuleEntry('@ohif/extension-cornerstone.utilityModule.tools')?.exports?.toolNames || {};
  } catch {
    names = {};
  }
  SEG_TOOL_NAMES.click = names.ClickSegment || 'ClickSegment';
  const add = (toolGroupId: string) => {
    const group: any = toolGroupService.getToolGroup(toolGroupId);
    if (!group) return;
    const missing = SEG_TOOLS(names).filter(t => !group.hasTool?.(t.toolName));
    if (missing.length) toolGroupService.addToolsToToolGroup(toolGroupId, { passive: missing });
  };
  (toolGroupService.getToolGroupIds?.() || []).forEach(add);
  const sub = toolGroupService.subscribe(toolGroupService.EVENTS.TOOLGROUP_CREATED, ({ toolGroupId }) => add(toolGroupId));
  return () => sub.unsubscribe();
}
