import React, { ReactNode } from 'react';
import { useSystem } from '@ohif/core';
import { Icons, Popover, PopoverContent, PopoverTrigger, useIconPresentation } from '@ohif/ui-next';
import AI3DControls from './AI3DControls';
import { aiSurfaceView } from './aiSurfaces';

type Props = {
  viewportId: string;
  location: string;
  isOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  disabled?: boolean;
  id?: string;
};

/**
 * «IA 3D» in the 3D viewport's corner (OHIF viewport action menu): the controls that belong to the AI surfaces of
 * this viewport — colouring, opacity, structures, background volume, PNG. Zoom, pan, rotate, capture and
 * measurements stay in the main toolbar.
 */
export default function AI3DMenu(props: Props): ReactNode {
  const { viewportId, location, isOpen = false, onOpen, onClose, disabled, ...rest } = props;
  const { servicesManager } = useSystem();
  const { toolbarService } = servicesManager.services;
  const { IconContainer, className: iconClassName, containerProps } = useIconPresentation();
  const { align, side } = toolbarService.getAlignAndSide(location);
  const view = isOpen ? aiSurfaceView(servicesManager, viewportId) : null;
  const Icon = <Icons.ByName name="tab-segmentation" className={iconClassName} />;
  const idProp = rest.id ? { id: `${rest.id}-${viewportId}` } : {};

  return (
    <Popover open={isOpen} onOpenChange={open => (open ? onOpen?.() : onClose?.())}>
      <PopoverTrigger asChild className="flex items-center justify-center">
        <div title="IA 3D: color, opacidad, estructuras, volumen, PNG">
          {IconContainer ? (
            <IconContainer disabled={disabled} icon="tab-segmentation" {...rest} {...containerProps} {...idProp}>
              {Icon}
            </IconContainer>
          ) : (
            Icon
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72 border-none bg-transparent p-0 shadow-none" side={side} align={align} sideOffset={5}>
        {view ? (
          <AI3DControls servicesManager={servicesManager} view={view} />
        ) : (
          <div className="bg-popover rounded p-2 text-[11px] text-white/70">Esta vista no tiene superficies de IA.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}
