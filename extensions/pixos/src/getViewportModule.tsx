import React from 'react';
import { useViewportElementRegistration } from '@ohif/core';
import Viewer3D from './Viewer3D';

/** A viewport of the grid showing the interactive 3D surfaces of an AI segmentation (display sets from ai3d.ts). */
function AI3DViewport({ displaySets, viewportId, onElementEnabled, servicesManager }: any) {
  const ds = displaySets?.[0] || {};
  const { register } = useViewportElementRegistration(viewportId);
  if (!ds.meshUrl) {
    return <div className="flex h-full w-full items-center justify-center bg-black text-[13px] text-white/70">Sin superficies 3D para esta serie</div>;
  }
  return (
    <div className="h-full w-full" data-viewport-id={viewportId} ref={el => { if (el) register(el); }}>
      <Viewer3D key={ds.meshUrl} url={ds.meshUrl} title={ds.aiSeg?.title || ds.label || 'Vista 3D'} stats={ds.aiSeg?.stats}
        servicesManager={servicesManager} onReady={onElementEnabled} />
    </div>
  );
}

function getViewportModule({ servicesManager }: withAppTypes) {
  return [{ name: 'ai3d', component: props => <AI3DViewport {...props} servicesManager={servicesManager} /> }];
}

export default getViewportModule;
